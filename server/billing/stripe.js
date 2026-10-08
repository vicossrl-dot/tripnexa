import Stripe from 'stripe';
import {assert,HttpError} from '../errors.js';
import {billingSecret,billingSettings,priceKey} from './configuration.js';
import {planFor} from './catalog.js';
import {setBillingStage} from './diagnostics.js';
export const STRIPE_API_VERSION='2026-08-26.dahlia';
export async function stripeProvider(settings=null){
 settings??=await billingSettings();const key=await billingSecret('STRIPE_SECRET_KEY');
 assert(new RegExp('^(sk|rk)_'+settings.billing_mode+'_').test(key),503,'Stripe is not configured for the selected billing mode.');
 return new Stripe(key,{apiVersion:STRIPE_API_VERSION,maxNetworkRetries:2,timeout:12000,appInfo:{name:'TripNexa'}});
}
export function stripeId(value){return typeof value==='string'?value:value?.id||null;}
export function verifyPrice(price,plan,mode){
 assert(price?.active&&price.livemode===(mode==='live')&&price.currency===plan.currency&&price.unit_amount===plan.amount&&price.billing_scheme==='per_unit'&&!price.transform_quantity,409,'The configured Stripe Price does not match this TripNexa plan.');
 assert(plan.kind==='subscription'?price.type==='recurring'&&price.recurring?.interval===plan.interval&&price.recurring?.interval_count===1&&price.recurring?.usage_type==='licensed':price.type==='one_time',409,'The configured Stripe Price has an unexpected billing interval.');return price;
}
export async function configuredPrice(client,code,settings){setBillingStage('validate_plan');const plan=planFor(code);assert(plan,400,'Choose a valid plan.');const id=settings[priceKey(code)];assert(/^price_[A-Za-z0-9]+$/.test(id||''),503,'This plan is not available for purchase yet.');setBillingStage('retrieve_price');const price=await client.prices.retrieve(id);setBillingStage('validate_price');return verifyPrice(price,plan,settings.billing_mode);}
export const paymentError=()=>new HttpError(503,'Billing is temporarily unavailable. Please try again or contact support.');
export function verifyPortal(configuration){assert(configuration.active&&configuration.features?.subscription_cancel?.enabled&&configuration.features.subscription_cancel.mode==='at_period_end',503,'Billing portal cancellation must be configured for the end of the paid period.');assert(!configuration.features?.subscription_update?.enabled,503,'Use the approved portal configuration without subscription price changes.');assert(configuration.features?.invoice_history?.enabled&&configuration.features?.payment_method_update?.enabled,503,'Billing portal must enable invoice history and payment method updates.');}
