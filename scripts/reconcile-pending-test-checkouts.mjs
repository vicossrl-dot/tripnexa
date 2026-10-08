// Targeted, repeatable data repair; no schema migration, deletes or blanket updates.
// node scripts/reconcile-pending-test-checkouts.mjs ORDER_ID_1 ORDER_ID_2 [--apply]
import assert from 'node:assert/strict';
import {pool} from '../server/db.js';
import {billingSettings} from '../server/billing/configuration.js';
import {stripeProvider,stripeId} from '../server/billing/stripe.js';
import {cancelCheckout} from '../server/billing/checkout.js';

try{
 const args=process.argv.slice(2),apply=args.includes('--apply'),ids=args.filter(arg=>arg!=='--apply');
 assert(ids.length===2&&new Set(ids).size===2&&ids.every(id=>/^[A-Za-z0-9_-]{1,64}$/.test(id)), 'Supply exactly two distinct billing_orders IDs; omit --apply for read-only inspection.');
 const settings=await billingSettings();assert.equal(settings.billing_mode,'test','This repair only operates in test billing mode. Do not change the deployment mode to run it.');
 const [orders]=await pool.execute('SELECT * FROM billing_orders WHERE id IN (?,?)',ids);
 assert.equal(orders.length,2,'Both exact order IDs must exist.');assert.equal(new Set(orders.map(o=>o.user_id)).size,1,'Orders must belong to the same user.');
 assert.deepEqual(orders.map(o=>o.plan_code).sort(),['PRO_MONTHLY','TRIP_PACK_5'],'Expected the reported monthly Pro and 5-credit purchases.');
 const stripe=await stripeProvider(settings),preview=[];
 for(const order of orders){
  assert(order.mode==='test'&&order.checkout_id,'Every order must have a test-mode Checkout Session.');
  const session=await stripe.checkout.sessions.retrieve(order.checkout_id);
  assert(session.livemode===false&&session.id===order.checkout_id&&session.mode===order.kind&&stripeId(session.customer)===order.customer_id&&session.metadata?.internal_order_id===order.id&&session.metadata?.internal_user_id===order.user_id&&session.metadata?.internal_plan_code===order.plan_code,'Stripe identity does not match the stored order.');
  assert(['pending','canceled','paid','refunded','partially_refunded'].includes(order.status),'Unexpected local status; inspect manually.');
  const action=order.status!=='pending'?'No change':session.status==='open'?'Expire session, then cancel local order':session.status==='expired'?'Cancel local order':session.status==='complete'&&session.payment_status==='paid'?'Reconcile paid order using normal fulfillment':'STOP: payment unresolved';
  preview.push({order_id:order.id,plan:order.plan_code,local_status:order.status,stripe_status:session.status,payment_status:session.payment_status,action});
 }
 console.log(JSON.stringify({apply,orders:preview},null,2));
 assert(!preview.some(row=>row.action.startsWith('STOP')),'An unresolved payment must not be canceled. Review it in Stripe. No repair was applied.');
 if(apply)for(const order of orders)console.log(JSON.stringify({order_id:order.id,...await cancelCheckout(order.user_id,order.id,stripe)}));
 else console.log('Dry run only. Review these two orders, then rerun with --apply. No data changed.');
}catch(error){console.error(error.code?.startsWith('ER_')?'Required billing database structure is unavailable. Review existing migrations.':error.status||error.type?'Stripe/order verification failed; review configuration and provider state.':error.message);process.exitCode=1;}
finally{await pool.end();}
