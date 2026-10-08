import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {assert} from '../errors.js';
import {billingSettings} from './configuration.js';
import {subscriptionAccess,BillingError,utcTime} from './catalog.js';
export async function lockUser(db,userId){const [[user]]=await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId]);assert(user,404,'Account not found.');}
export async function currentSubscription(db,userId,settings){const [rows]=await db.execute('SELECT * FROM billing_subscriptions WHERE user_id=? AND mode=? ORDER BY period_end DESC',[userId,settings.billing_mode]);return rows.find(row=>subscriptionAccess(row,settings))||null;}
export async function getUserBillingState(userId,db=pool,settings=null){
 settings??=await billingSettings();const [subscriptions]=await db.execute('SELECT * FROM billing_subscriptions WHERE user_id=? AND mode=? ORDER BY period_end DESC',[userId,settings.billing_mode]);const sub=subscriptions.find(s=>subscriptionAccess(s,settings));
 const [[free]]=await db.execute('SELECT used FROM billing_free_allowances WHERE user_id=?',[userId]);const [[credits]]=await db.execute('SELECT COALESCE(SUM(remaining),0) AS balance FROM billing_credit_lots WHERE user_id=? AND mode=?',[userId,settings.billing_mode]);
 let used=0;if(sub){const [[period]]=await db.execute('SELECT used FROM billing_period_usage WHERE mode=? AND subscription_id=? AND period_start=?',[settings.billing_mode,sub.provider_id,sub.period_start]);used=period?.used||0;}
 const recent=sub||subscriptions[0];return {plan:sub?'PRO':'FREE',enforcement:settings.billing_enforcement_enabled,free_used:free?.used||0,credits:Number(credits.balance),subscription:recent?{plan_code:recent.plan_code,status:recent.status,period_start:recent.period_start,period_end:recent.period_end,cancel_at_period_end:!!recent.cancel_at_period_end,cancel_at:recent.cancel_at,next_billing_date:recent.cancel_at_period_end||recent.cancel_at||!['active','trialing','past_due'].includes(recent.status)?null:recent.period_end,used,limit:20,has_access:!!sub}:null};
}
export async function tripAccess(db,userId,tripId,settings){
 const [[trip]]=await db.execute('SELECT id FROM trips WHERE id=? AND owner_id=?',[tripId,userId]);assert(trip,404,'Trip not found.');
 const [[entitlement]]=await db.execute("SELECT * FROM billing_trip_entitlements WHERE trip_id=? AND user_id=? AND status='active' AND mode IN (?, 'shared')",[tripId,userId,settings.billing_mode]);
 const durable=entitlement&&entitlement.source!=='FREE'&&(!entitlement.expires_at||utcTime(entitlement.expires_at)>Date.now());return {premium:!settings.billing_enforcement_enabled||!!durable||!!await currentSubscription(db,userId,settings),entitlement};
}
export async function requireFeature(userId,feature,tripId=null,db=pool,settings=null){
 settings??=await billingSettings();if(!settings.billing_enforcement_enabled)return;
 const premium=tripId?(await tripAccess(db,userId,tripId,settings)).premium:!!await currentSubscription(db,userId,settings);
 if(!premium){const label={calendar_exports:'Add to Calendar',destination_essentials:'Before You Go',interactive_trip_maps:'Interactive Trip Maps',pdf_exports:'PDF export',ai_document_extractions:'Document extraction',smart_repair:'Smart Repair',advanced_ai:'Advanced AI'}[feature]||'This feature';throw new BillingError('PREMIUM_FEATURE_REQUIRED',feature,label+(tripId?' is available with Pro or a premium trip credit.':' is available with Pro.'),{tripId,allowTripPack:!!tripId});}
}
export async function consumeTripCreation(db,userId,tripId,settings=null){
 settings??=await billingSettings();await lockUser(db,userId);
 const [[exists]]=await db.execute('SELECT trip_id FROM billing_trip_entitlements WHERE trip_id=?',[tripId]);assert(!exists,409,'This trip creation was already recorded.');
 let source='LEGACY_GRANDFATHERED',mode='shared',subscriptionId=null,orderId=null,lotId=null;
 if(settings.billing_enforcement_enabled){
  mode=settings.billing_mode;const sub=await currentSubscription(db,userId,settings);let used=0;
  if(sub){await db.execute('INSERT INTO billing_period_usage(user_id,mode,subscription_id,period_start,period_end,used)VALUES(?,?,?,?,?,0) ON DUPLICATE KEY UPDATE used=used',[userId,mode,sub.provider_id,sub.period_start,sub.period_end]);const [[period]]=await db.execute('SELECT used FROM billing_period_usage WHERE mode=? AND subscription_id=? AND period_start=? FOR UPDATE',[mode,sub.provider_id,sub.period_start]);used=period.used;if(used<20){source='SUBSCRIPTION';subscriptionId=sub.provider_id;await db.execute('UPDATE billing_period_usage SET used=used+1 WHERE mode=? AND subscription_id=? AND period_start=?',[mode,sub.provider_id,sub.period_start]);}}
  if(!subscriptionId){const [[lot]]=await db.execute('SELECT * FROM billing_credit_lots WHERE user_id=? AND mode=? AND remaining>0 ORDER BY created_at,id LIMIT 1 FOR UPDATE',[userId,mode]);
   if(lot){source=lot.source==='ADMIN_GRANT'?'ADMIN_GRANT':'TRIP_PACK';lotId=lot.id;orderId=lot.order_id;await db.execute('UPDATE billing_credit_lots SET remaining=remaining-1 WHERE id=? AND remaining>0',[lot.id]);await db.execute("INSERT INTO billing_credit_ledger(id,user_id,mode,lot_id,order_id,trip_id,delta,kind)VALUES(?,?,?,?,?,?,-1,'CONSUME')",[randomUUID(),userId,mode,lot.id,lot.order_id,tripId]);}
   else {const [[free]]=await db.execute('SELECT used FROM billing_free_allowances WHERE user_id=? FOR UPDATE',[userId]);if(sub||free?.used)throw new BillingError('TRIP_LIMIT_REACHED','TRIP_CREATION',sub?'You have used all 20 Pro trips for this billing period.':'Your free trip has already been used.',{used:sub?used:1,limit:sub?20:1,plan:sub?'PRO':'FREE'});source='FREE';mode='shared';}
  }
 }
 await db.execute('INSERT INTO billing_free_allowances(user_id,used)VALUES(?,1) ON DUPLICATE KEY UPDATE used=GREATEST(used,1)',[userId]);
 await db.execute('INSERT INTO billing_trip_entitlements(trip_id,user_id,source,mode,subscription_id,order_id,lot_id)VALUES(?,?,?,?,?,?,?)',[tripId,userId,source,mode,subscriptionId,orderId,lotId]);
 if(lotId)await db.execute("INSERT INTO analytics_events(id,user_id,event)VALUES(?,?,'trip_credit_consumed')",[randomUUID(),userId]);
}
export async function activateTrip(userId,tripId){
 const settings=await billingSettings();return transaction(async db=>{await lockUser(db,userId);const access=await tripAccess(db,userId,tripId,settings);if(access.premium)return {ok:true,already_premium:true};
  const [[lot]]=await db.execute('SELECT * FROM billing_credit_lots WHERE user_id=? AND mode=? AND remaining>0 ORDER BY created_at,id LIMIT 1 FOR UPDATE',[userId,settings.billing_mode]);if(!lot)throw new BillingError('TRIP_LIMIT_REACHED','TRIP_ACTIVATION','Buy a Trip Pack to unlock this existing trip.',{tripId,used:0,limit:0});
  await db.execute('UPDATE billing_credit_lots SET remaining=remaining-1 WHERE id=?',[lot.id]);await db.execute("INSERT INTO billing_credit_ledger(id,user_id,mode,lot_id,order_id,trip_id,delta,kind)VALUES(?,?,?,?,?,?,-1,'ACTIVATE')",[randomUUID(),userId,settings.billing_mode,lot.id,lot.order_id,tripId]);
  await db.execute("INSERT INTO billing_trip_entitlements(trip_id,user_id,source,mode,order_id,lot_id)VALUES(?,?,'TRIP_PACK',?,?,?) ON DUPLICATE KEY UPDATE source=VALUES(source),mode=VALUES(mode),order_id=VALUES(order_id),lot_id=VALUES(lot_id),status='active',expires_at=NULL",[tripId,userId,settings.billing_mode,lot.order_id,lot.id]);return {ok:true};
 });
}
const uploadId=value=>/^\/api\/uploads\/([a-f0-9-]{36})$/.exec(value||'')?.[1];
export async function tripFiles(db,userId,tripId){
 const [[trip]]=await db.execute('SELECT arrival_ticket_url,departure_ticket_url FROM trips WHERE id=? AND owner_id=?',[tripId,userId]);assert(trip,404,'Trip not found.');const [items]=await db.execute('SELECT reservation_file_url,image_url,category FROM trip_items WHERE trip_id=? AND owner_id=?',[tripId,userId]);
 const [attachments]=await db.execute('SELECT a.upload_id FROM item_attachments a JOIN trip_items i ON i.id=a.item_id WHERE i.trip_id=? AND a.owner_id=?',[tripId,userId]);const [scopes]=await db.execute('SELECT upload_id FROM billing_upload_scopes WHERE trip_id=? AND user_id=?',[tripId,userId]);
 return new Set([...Object.values(trip).map(uploadId),...items.flatMap(i=>[uploadId(i.reservation_file_url),i.category==='document'?uploadId(i.image_url):null]),...attachments.map(a=>a.upload_id),...scopes.map(a=>a.upload_id)].filter(Boolean));
}
export async function checkWalletCapacity(db,userId,tripId,{additional=[],previous=null}={}){
 const settings=await billingSettings();if(!settings.billing_enforcement_enabled)return;
 await db.execute('SELECT id FROM trips WHERE id=? AND owner_id=? FOR UPDATE',[tripId,userId]);const {premium}=await tripAccess(db,userId,tripId,settings),limit=premium?settings.billing_premium_wallet_files:4,files=await tripFiles(db,userId,tripId);const used=files.size;
 for(const id of additional)if(id)files.add(id);
 if(files.size>limit&&(previous===null||files.size>previous))throw new BillingError('WALLET_LIMIT_REACHED','WALLET_UPLOAD',`Your Travel Wallet allows up to ${limit} files per trip.`,{used:previous??used,limit,tripId,premium,allowTripPack:!premium,requiredPlan:premium?null:'PRO'});
}
