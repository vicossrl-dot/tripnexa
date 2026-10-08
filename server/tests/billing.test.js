import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {PLANS,planFor,subscriptionAccess,BillingError} from '../billing/catalog.js';
import {verifyPrice,verifyPortal} from '../billing/stripe.js';
import {redactText} from '../admin/audit.js';

test('Billing catalog is canonical and rejects prototype/unknown plan codes',()=>{
 assert.deepEqual(Object.values(PLANS).map(p=>p.amount),[999,7999,1499,2499,3999]);
 for(const key of ['__proto__','constructor','9.99','PRO'])assert.equal(planFor(key),null);
 assert.equal(PLANS.PRO_ANNUAL.trips,20);assert.equal(PLANS.PRO_ANNUAL.interval,'year');
 const error=new BillingError('TRIP_LIMIT_REACHED','TRIP_CREATION','Limit',{used:20,limit:20});assert.equal(error.status,402);assert.equal(error.billing.code,'TRIP_LIMIT_REACHED');
});
test('Access uses Stripe period boundaries, scheduled cancellation and bounded delinquency',()=>{
 const now=Date.UTC(2026,9,10),settings={billing_past_due_grace_days:3,billing_unpaid_grace_days:0};
 const sub={status:'active',period_start:'2026-09-15 12:00:00',period_end:'2026-10-15 12:00:00',cancel_at_period_end:true};
 assert(subscriptionAccess(sub,settings,now));assert(!subscriptionAccess(sub,settings,Date.UTC(2026,9,15,12)));
 assert(!subscriptionAccess({...sub,status:'canceled'},settings,now));assert(!subscriptionAccess({...sub,status:'incomplete'},settings,now));
 assert(subscriptionAccess({...sub,status:'past_due',delinquent_since:'2026-10-08 00:00:00'},settings,now));
 assert(!subscriptionAccess({...sub,status:'past_due',delinquent_since:'2026-10-06 00:00:00'},settings,now));
 assert(!subscriptionAccess({...sub,status:'unpaid',delinquent_since:'2026-10-09 00:00:00'},settings,now));
});
test('Stripe price/portal validation rejects wrong money, mode, cadence and immediate cancellation',()=>{
 const plan=PLANS.PRO_ANNUAL,price={active:true,livemode:false,currency:'usd',unit_amount:7999,billing_scheme:'per_unit',type:'recurring',recurring:{interval:'year',interval_count:1,usage_type:'licensed'}};
 assert.equal(verifyPrice(price,plan,'test'),price);
 for(const change of [{livemode:true},{currency:'eur'},{unit_amount:999},{active:false},{transform_quantity:{divide_by:5}},{recurring:{...price.recurring,interval:'month'}}])assert.throws(()=>verifyPrice({...price,...change},plan,'test'));
 const portal={active:true,features:{subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:false},invoice_history:{enabled:true},payment_method_update:{enabled:true}}};assert.doesNotThrow(()=>verifyPortal(portal));assert.throws(()=>verifyPortal({...portal,features:{subscription_cancel:{enabled:true,mode:'immediately'}}}));
});
test('Stripe signatures authenticate original bytes and reject altered bodies/old timestamps',()=>{
 const secret='whsec_synthetic_fixture',payload=JSON.stringify({id:'evt_fixture',type:'invoice.paid'}),header=Stripe.webhooks.generateTestHeaderString({payload,secret});
 assert.equal(Stripe.webhooks.constructEvent(Buffer.from(payload),header,secret).id,'evt_fixture');
 assert.throws(()=>Stripe.webhooks.constructEvent(Buffer.from(payload+' '),header,secret));
 assert.throws(()=>Stripe.webhooks.constructEvent(Buffer.from(payload),Stripe.webhooks.generateTestHeaderString({payload,secret,timestamp:1}),secret));
});
test('Audit reasons redact Stripe credentials even if pasted by an operator',()=>{const value=redactText('sk_test_synthetic123 rk_live_synthetic456 whsec_synthetic789');assert(!value.includes('synthetic'));});
