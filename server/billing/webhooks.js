import Stripe from 'stripe';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {assert} from '../errors.js';
import {billingSecret,billingSettings} from './configuration.js';
import {stripeProvider,stripeId,verifyPrice} from './stripe.js';
import {planFor,unixDate} from './catalog.js';
import {lockUser} from './entitlements.js';
import {audit} from '../admin/audit.js';
export const BILLING_EVENTS=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_succeeded','invoice.payment_failed','invoice.payment_action_required','charge.refunded','refund.updated','refund.created'];
const objectId=value=>typeof value==='string'&&/^[A-Za-z0-9_]{1,100}$/.test(value);
async function syncSubscription(db,sub,userId,mode){
 const plan=planFor(sub.metadata?.internal_plan_code);assert(plan?.kind==='subscription'&&sub.metadata.internal_user_id===userId,409,'Subscription reconciliation requires review.');
 const [[order]]=await db.execute('SELECT * FROM billing_orders WHERE id=? AND user_id=? AND mode=? FOR UPDATE',[sub.metadata.internal_order_id,userId,mode]);assert(order&&order.plan_code===plan.code&&order.customer_id===stripeId(sub.customer),409,'Subscription order could not be reconciled.');
 const items=sub.items?.data;assert(items?.length===1&&!sub.items.has_more&&items[0].quantity===1&&items[0].price.id===order.price_id,409,'Subscription items require review.');verifyPrice({...items[0].price,active:true},plan,mode);
 const start=unixDate(items[0].current_period_start),end=unixDate(items[0].current_period_end);assert(start&&end&&end>start,409,'Subscription billing period is unavailable.');
 const [[previous]]=await db.execute('SELECT status,delinquent_since FROM billing_subscriptions WHERE mode=? AND provider_id=? FOR UPDATE',[mode,sub.id]);const delinquent=['past_due','unpaid'].includes(sub.status)?previous?.delinquent_since||new Date():null;
 await db.execute('INSERT INTO billing_subscriptions(provider_id,mode,user_id,plan_code,status,period_start,period_end,cancel_at_period_end,cancel_at,delinquent_since)VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),period_start=VALUES(period_start),period_end=VALUES(period_end),cancel_at_period_end=VALUES(cancel_at_period_end),cancel_at=VALUES(cancel_at),delinquent_since=VALUES(delinquent_since),last_synced_at=UTC_TIMESTAMP(3)',[sub.id,mode,userId,plan.code,sub.status,start,end,!!sub.cancel_at_period_end,unixDate(sub.cancel_at),delinquent]);
 await db.execute('UPDATE billing_orders SET subscription_id=? WHERE id=?',[sub.id,order.id]);
 if(previous?.status!==sub.status)await audit(db,{action:'billing.subscription_'+sub.status,targetType:'billing_subscription',targetId:sub.id,metadata:{provider:'stripe',source:mode}});
}
export async function reconcileCheckout(userId,session,stripe,settings){return transaction(async db=>{await lockUser(db,userId);await fulfillCheckout(db,stripe,session,userId,settings.billing_mode);});}
export async function fulfillCheckout(db,stripe,session,userId,mode){
 assert(session.livemode===(mode==='live'),409,'Unexpected billing mode.');
 const metadata=session.metadata||{},[[order]]=await db.execute('SELECT * FROM billing_orders WHERE id=? AND user_id=? AND mode=? FOR UPDATE',[metadata.internal_order_id||'',userId,mode]);
 assert(order&&metadata.internal_user_id===userId&&metadata.internal_plan_code===order.plan_code&&session.mode===order.kind&&stripeId(session.customer)===order.customer_id,409,'Checkout order could not be reconciled.');
 assert(!order.checkout_id||order.checkout_id===session.id,409,'Unexpected Checkout Session.');
 // A verified completed redirect is not enough: Stripe must confirm paid status.
 if(session.status==='expired'){if(order.status==='pending')await db.execute("UPDATE billing_orders SET status='canceled' WHERE id=?",[order.id]);return;}
 if(session.status!=='complete'||session.payment_status!=='paid')return;
 const plan=planFor(order.plan_code),lines=await stripe.checkout.sessions.listLineItems(session.id,{limit:2});assert(lines.data.length===1&&!lines.has_more&&lines.data[0].price.id===order.price_id&&lines.data[0].quantity===1,409,'Checkout items require review.');
 if(order.kind==='subscription'){const sub=await stripe.subscriptions.retrieve(stripeId(session.subscription));await syncSubscription(db,sub,userId,mode);}
 if(['paid','refunded','partially_refunded'].includes(order.status))return;
 if(plan.kind==='payment'){
  const lot=randomUUID();await db.execute("INSERT INTO billing_credit_lots(id,user_id,mode,order_id,source,granted,remaining)VALUES(?,?,?,?,'TRIP_PACK',?,?)",[lot,userId,mode,order.id,plan.credits,plan.credits]);await db.execute("INSERT INTO billing_credit_ledger(id,user_id,mode,lot_id,order_id,delta,kind)VALUES(?,?,?,?,?,?,'PURCHASE')",[randomUUID(),userId,mode,lot,order.id,plan.credits]);
 }
 await db.execute("UPDATE billing_orders SET status='paid',checkout_id=?,payment_id=?,subscription_id=?,paid_amount=?,paid_at=UTC_TIMESTAMP(3) WHERE id=?",[session.id,stripeId(session.payment_intent),stripeId(session.subscription),session.amount_total,order.id]);await audit(db,{action:plan.kind==='payment'?'billing.trip_pack_purchased':'billing.subscription_activated',targetType:'billing_order',targetId:order.id,metadata:{provider:'stripe',count:plan.credits||20}});
 // A refund notification can precede checkout completion. Reconcile the current
 // charge in this same transaction before newly granted credits become usable.
 if(plan.kind==='payment'&&session.payment_intent){const payment=await stripe.paymentIntents.retrieve(stripeId(session.payment_intent));if(payment.latest_charge)await recordRefund(db,stripe,await stripe.charges.retrieve(stripeId(payment.latest_charge)),userId,mode);}
}
async function recordRefund(db,stripe,charge,userId,mode){
 const [[order]]=await db.execute('SELECT * FROM billing_orders WHERE mode=? AND user_id=? AND payment_id=? FOR UPDATE',[mode,userId,stripeId(charge.payment_intent)]);if(!order)return;
 const refunded=Math.max(order.refunded_amount,charge.amount_refunded||0);if(!refunded)return;
 const [[lot]]=await db.execute('SELECT * FROM billing_credit_lots WHERE order_id=? FOR UPDATE',[order.id]);
 if(lot){const desired=refunded>=charge.amount?lot.granted:Math.floor(lot.granted*refunded/charge.amount),remove=Math.min(lot.remaining,Math.max(0,desired-order.refund_credit_removed));if(remove){await db.execute('UPDATE billing_credit_lots SET remaining=remaining-? WHERE id=?',[remove,lot.id]);await db.execute("INSERT INTO billing_credit_ledger(id,user_id,mode,lot_id,order_id,delta,kind,reason)VALUES(?,?,?,?,?,?,'REFUND','Unused credits removed after verified Stripe refund')",[randomUUID(),userId,mode,lot.id,order.id,-remove]);await db.execute('UPDATE billing_orders SET refund_credit_removed=refund_credit_removed+? WHERE id=?',[remove,order.id]);}}
 await db.execute('UPDATE billing_orders SET status=?,refunded_amount=? WHERE id=?',[refunded>=charge.amount?'refunded':'partially_refunded',refunded,order.id]);await audit(db,{action:'billing.refund_recorded',targetType:'billing_order',targetId:order.id,metadata:{provider:'stripe'}});
}
export async function processBillingEvent(event,stripe,settings){
 const mode=event.livemode?'live':'test';assert(mode===settings.billing_mode&&objectId(event.id),400,'Unexpected webhook mode or identifier.');
 await pool.execute('INSERT IGNORE INTO billing_events(mode,event_id,type,object_id)VALUES(?,?,?,?)',[mode,event.id,event.type,objectId(event.data?.object?.id)?event.data.object.id:null]);
 try{return await transaction(async db=>{
  const [[stored]]=await db.execute('SELECT * FROM billing_events WHERE mode=? AND event_id=? FOR UPDATE',[mode,event.id]);if(stored.status==='processed')return {duplicate:true};
  await db.execute("UPDATE billing_events SET attempts=attempts+1,status='processing',error_code=NULL WHERE mode=? AND event_id=?",[mode,event.id]);
  if(BILLING_EVENTS.includes(event.type)){
   const payload=event.data.object;let customerId=stripeId(payload.customer);
   if(event.type.startsWith('refund.')){const charge=await stripe.charges.retrieve(stripeId(payload.charge));customerId=stripeId(charge.customer);}
   const [[customer]]=await db.execute('SELECT user_id FROM billing_customers WHERE mode=? AND provider_id=?',[mode,customerId||'']);
   if(!customer){assert(!payload.metadata?.internal_user_id,409,'Customer reconciliation is pending.');}
   else{
    await lockUser(db,customer.user_id);
    if(event.type.startsWith('checkout.session.')){
     const session=await stripe.checkout.sessions.retrieve(payload.id);await fulfillCheckout(db,stripe,session,customer.user_id,mode);
     if(event.type==='checkout.session.async_payment_failed'&&session.payment_status!=='paid')await db.execute("UPDATE billing_orders SET status='failed' WHERE checkout_id=? AND mode=? AND user_id=? AND status='pending'",[session.id,mode,customer.user_id]);
    }else if(event.type.startsWith('customer.subscription.'))await syncSubscription(db,await stripe.subscriptions.retrieve(payload.id),customer.user_id,mode);
    else if(event.type.startsWith('invoice.')){const invoice=await stripe.invoices.retrieve(payload.id),id=stripeId(invoice.parent?.subscription_details?.subscription);if(id)await syncSubscription(db,await stripe.subscriptions.retrieve(id),customer.user_id,mode);}
    else{const charge=await stripe.charges.retrieve(event.type==='charge.refunded'?payload.id:stripeId(payload.charge));await recordRefund(db,stripe,charge,customer.user_id,mode);}
   }
  }
  await db.execute("UPDATE billing_events SET status='processed',processed_at=UTC_TIMESTAMP(3),error_code=NULL WHERE mode=? AND event_id=?",[mode,event.id]);return {received:true};
 });}catch(error){await pool.execute("UPDATE billing_events SET status='failed',attempts=attempts+1,error_code=? WHERE mode=? AND event_id=? AND status<>'processed'",[error.status===409?'RECONCILIATION_REQUIRED':'PROCESSING_FAILED',mode,event.id]);throw error;}
}
export async function stripeWebhook(req,res){
 let event;try{const secret=await billingSecret('STRIPE_WEBHOOK_SECRET');assert(secret,503,'Webhook configuration unavailable.');event=Stripe.webhooks.constructEvent(req.body,req.get('Stripe-Signature'),secret);}catch{return res.status(400).json({error:'Invalid billing webhook signature.'});}
 try{const settings=await billingSettings();const stripe=await stripeProvider(settings);res.json(await processBillingEvent(event,stripe,settings));}catch{res.status(503).json({error:'Billing event could not be processed. Retry is required.'});}
}
