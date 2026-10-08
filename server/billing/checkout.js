import {setBillingStage} from './diagnostics.js';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {assert} from '../errors.js';
import {getAppUrls,buildApplicationUrl} from '../app-urls.js';
import {billingSettings} from './configuration.js';
import {planFor,utcTime} from './catalog.js';
import {stripeProvider,configuredPrice,verifyPortal} from './stripe.js';
import {lockUser} from './entitlements.js';
import {recordEvent} from '../admin/telemetry.js';
import {fulfillCheckout} from './webhooks.js';
// Commit reconciliation separately: a later new-purchase guard must not roll it back.
export async function reconcilePendingCheckouts(userId,settings,stripe){
 await transaction(async db=>{
  await lockUser(db,userId);
  const [orders]=await db.execute("SELECT * FROM billing_orders WHERE user_id=? AND mode=? AND status='pending' AND checkout_id IS NOT NULL FOR UPDATE",[userId,settings.billing_mode]);
  for(const order of orders){
   const session=await stripe.checkout.sessions.retrieve(order.checkout_id);
   assert(session.id===order.checkout_id&&session.livemode===(settings.billing_mode==='live'),409,'Unexpected Checkout Session or billing mode.');
   await fulfillCheckout(db,stripe,session,userId,settings.billing_mode);
  }
 });
}
// Commit the intent before contacting Stripe; an ambiguous create is never retried
// after its idempotency window, even when another order is requested later.
async function ensureCustomer(stripe,user,mode){
 await transaction(async db=>{await lockUser(db,user.id);await db.execute('INSERT IGNORE INTO billing_customer_intents(user_id,mode)VALUES(?,?)',[user.id,mode]);});
 return transaction(async db=>{
  await lockUser(db,user.id);const [[known]]=await db.execute('SELECT provider_id FROM billing_customers WHERE user_id=? AND mode=?',[user.id,mode]);if(known)return known.provider_id;
  const [[intent]]=await db.execute('SELECT created_at FROM billing_customer_intents WHERE user_id=? AND mode=?',[user.id,mode]);assert(utcTime(intent.created_at)>Date.now()-23*3600000,409,'Billing account creation requires support reconciliation before retrying.');
  const customer=await stripe.customers.create({email:user.email,metadata:{internal_user_id:user.id}},{idempotencyKey:'tripnexa-customer-'+mode+'-'+user.id});
  await db.execute('INSERT INTO billing_customers(user_id,mode,provider_id)VALUES(?,?,?)',[user.id,mode,customer.id]);return customer.id;
 });
}
export async function createCheckout(user,body,client=null){
 setBillingStage('load_config');const settings=await billingSettings();setBillingStage('validate_billing');assert(settings.billing_enabled,503,'Purchases are currently unavailable. Your saved trips remain accessible.');
 setBillingStage('validate_plan');assert(body&&Object.keys(body).every(key=>['plan_code','request_key'].includes(key)),400,'Send only a plan code and request key.');const plan=planFor(body.plan_code);assert(plan,400,'Choose a valid plan.');assert(typeof body.request_key==='string'&&/^[A-Za-z0-9_-]{16,100}$/.test(body.request_key),400,'A valid checkout request key is required.');
 setBillingStage('load_secret');const stripe=client||await stripeProvider(settings),price=await configuredPrice(stripe,plan.code,settings);setBillingStage('load_config');const urls=await getAppUrls();assert(urls.application.value,503,'Application URL is not configured.');
 setBillingStage('reconcile_pending');await reconcilePendingCheckouts(user.id,settings,stripe);
 const order=await transaction(async db=>{
  await lockUser(db,user.id);
  const [[retry]]=await db.execute('SELECT * FROM billing_orders WHERE user_id=? AND mode=? AND request_key=?',[user.id,settings.billing_mode,body.request_key]);if(retry){assert(retry.plan_code===plan.code,409,'This checkout request belongs to another plan.');return retry;}
  const [[pending]]=await db.execute("SELECT * FROM billing_orders WHERE user_id=? AND mode=? AND kind=? AND status='pending' ORDER BY created_at LIMIT 1 FOR UPDATE",[user.id,settings.billing_mode,plan.kind]);
  if(pending){assert(pending.plan_code===plan.code,409,'Finish or cancel your pending checkout before choosing another plan.');return pending;}
  if(plan.kind==='subscription'){const [[active]]=await db.execute("SELECT provider_id FROM billing_subscriptions WHERE user_id=? AND mode=? AND status NOT IN ('canceled','incomplete_expired') LIMIT 1",[user.id,settings.billing_mode]);assert(!active,409,'A subscription already exists. Use Manage Billing.');}
  const id=randomUUID();await db.execute('INSERT INTO billing_orders(id,user_id,mode,plan_code,kind,request_key,price_id,amount,currency,expires_at)VALUES(?,?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 23 HOUR))',[id,user.id,settings.billing_mode,plan.code,plan.kind,body.request_key,price.id,plan.amount,plan.currency]);const [[row]]=await db.execute('SELECT * FROM billing_orders WHERE id=?',[id]);return row;
 });
 if(order.status!=='pending')return {order_id:order.id,status:order.status,url:null};
 setBillingStage('find_or_create_customer');const customerId=await ensureCustomer(stripe,user,settings.billing_mode);
 await transaction(async db=>{await lockUser(db,user.id);await db.execute('UPDATE billing_orders SET customer_id=? WHERE id=?',[customerId,order.id]);});
 setBillingStage('reconcile_pending');const result=await transaction(async db=>{
  await lockUser(db,user.id);const [[current]]=await db.execute('SELECT * FROM billing_orders WHERE id=? FOR UPDATE',[order.id]);
  if(current.status!=='pending')return {order_id:current.id,status:current.status,url:null};
  if(current.checkout_id){const session=await stripe.checkout.sessions.retrieve(current.checkout_id);assert(session.id===current.checkout_id&&session.livemode===(settings.billing_mode==='live'),409,'Unexpected Checkout Session or billing mode.');await fulfillCheckout(db,stripe,session,user.id,settings.billing_mode);const [[updated]]=await db.execute('SELECT status FROM billing_orders WHERE id=?',[current.id]);return {order_id:current.id,status:updated.status,url:session.status==='open'?session.url:null};}
  // Never repeat an ambiguous remote create after Stripe's idempotency retention window.
  assert(utcTime(current.created_at)>Date.now()-23*3600000,409,'This checkout needs billing support reconciliation before retrying.');
  const customer={provider_id:customerId};
  if(plan.kind==='subscription'){const subscriptions=await stripe.subscriptions.list({customer:customer.provider_id,status:'all',limit:100});assert(!subscriptions.has_more&&!subscriptions.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)),409,'A subscription already exists. Use Manage Billing.');}
  const metadata={internal_user_id:user.id,internal_plan_code:plan.code,purchase_type:plan.kind,internal_order_id:current.id};
    setBillingStage('create_checkout_session');const session=await stripe.checkout.sessions.create({mode:plan.kind,customer:customer.provider_id,client_reference_id:user.id,line_items:[{price:current.price_id,quantity:1}],metadata,...(plan.kind==='subscription'?{subscription_data:{metadata}}:{payment_intent_data:{metadata}}),automatic_tax:{enabled:settings.billing_automatic_tax},customer_update:{address:'auto'},success_url:buildApplicationUrl(urls,'/billing/success?order='+current.id),cancel_url:buildApplicationUrl(urls,'/billing/cancel?order='+current.id),expires_at:Math.floor(utcTime(current.expires_at)/1000)},{idempotencyKey:'tripnexa-checkout-'+current.id});
  setBillingStage('save_checkout_session');assert(session.livemode===(settings.billing_mode==='live'),502,'Unexpected billing mode.');await db.execute('UPDATE billing_orders SET customer_id=?,checkout_id=?,checkout_url=? WHERE id=?',[customer.provider_id,session.id,session.url,current.id]);return {order_id:current.id,status:'pending',url:session.url};
 });void recordEvent('checkout_started',user.id);return result;
}
export async function cancelCheckout(userId,orderId,client=null){
 const settings=await billingSettings(),stripe=client||await stripeProvider(settings);
 return transaction(async db=>{await lockUser(db,userId);const [[order]]=await db.execute('SELECT * FROM billing_orders WHERE id=? AND user_id=? AND mode=? FOR UPDATE',[orderId,userId,settings.billing_mode]);assert(order,404,'Purchase not found.');
  if(order.status!=='pending')return {status:order.status};
  assert(order.checkout_id,409,'Checkout creation is pending. Resume it before canceling, or contact support.');
  let session=await stripe.checkout.sessions.retrieve(order.checkout_id);
  assert(session.id===order.checkout_id&&session.livemode===(settings.billing_mode==='live'),409,'Unexpected Checkout Session or billing mode.');
  if(session.status==='open'){
   try{session=await stripe.checkout.sessions.expire(order.checkout_id,{},{idempotencyKey:'tripnexa-expire-'+order.id});}
   catch(error){session=await stripe.checkout.sessions.retrieve(order.checkout_id);if(session.status==='open')throw error;}
  }
  assert(session.id===order.checkout_id&&session.livemode===(settings.billing_mode==='live'),409,'Unexpected Checkout Session or billing mode.');
  await fulfillCheckout(db,stripe,session,userId,settings.billing_mode);
  const [[updated]]=await db.execute('SELECT status FROM billing_orders WHERE id=?',[order.id]);
  assert(updated.status!=='pending',409,'Payment is already processing. Wait for confirmation before changing this purchase.');
  return {status:updated.status};
 });
}
export async function createPortal(userId){const settings=await billingSettings(),stripe=await stripeProvider(settings);const [[customer]]=await pool.execute('SELECT provider_id FROM billing_customers WHERE user_id=? AND mode=?',[userId,settings.billing_mode]);assert(customer,409,'No billing account exists yet.');assert(/^bpc_[A-Za-z0-9]+$/.test(settings.stripe_portal_configuration),503,'The customer portal is not configured yet.');verifyPortal(await stripe.billingPortal.configurations.retrieve(settings.stripe_portal_configuration));const session=await stripe.billingPortal.sessions.create({customer:customer.provider_id,configuration:settings.stripe_portal_configuration,return_url:buildApplicationUrl(await getAppUrls(),'/billing')});return {url:session.url};}
