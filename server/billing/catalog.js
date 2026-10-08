export const PLANS = Object.freeze({
  PRO_MONTHLY: {code:'PRO_MONTHLY',name:'Pro Monthly',kind:'subscription',amount:999,currency:'usd',interval:'month',trips:20},
  PRO_ANNUAL: {code:'PRO_ANNUAL',name:'Pro Annual',kind:'subscription',amount:7999,currency:'usd',interval:'year',trips:20},
  TRIP_PACK_5: {code:'TRIP_PACK_5',name:'Trip Pack 5',kind:'payment',amount:1499,currency:'usd',credits:5},
  TRIP_PACK_10: {code:'TRIP_PACK_10',name:'Trip Pack 10',kind:'payment',amount:2499,currency:'usd',credits:10},
  TRIP_PACK_20: {code:'TRIP_PACK_20',name:'Trip Pack 20',kind:'payment',amount:3999,currency:'usd',credits:20},
});
export const planFor=code=>Object.hasOwn(PLANS,code)?PLANS[code]:null;
export const unixDate=value=>Number.isFinite(Number(value))&&Number(value)>0?new Date(Number(value)*1000):null;
export const utcTime=value=>value instanceof Date?value.getTime():Date.parse(String(value||'').replace(' ','T').replace(/Z$/,'')+'Z');
export function subscriptionAccess(sub,settings,now=Date.now()){
 if(!sub)return false;
 if(['active','trialing'].includes(sub.status))return utcTime(sub.period_start)<=now&&utcTime(sub.period_end)>now;
 if(!['past_due','unpaid'].includes(sub.status)||!sub.delinquent_since)return false;
 const days=sub.status==='past_due'?settings.billing_past_due_grace_days:settings.billing_unpaid_grace_days;
 return days>0&&utcTime(sub.delinquent_since)+days*86400000>now;
}
export class BillingError extends Error {
 constructor(code,feature,message,details={}){super(message);this.status=402;this.billing={code,feature,requiredPlan:'PRO',allowTripPack:true,...details};}
}
