import test from 'node:test';
import assert from 'node:assert/strict';
import {requireFeature} from '../billing/entitlements.js';
import {pool} from '../db.js';
test.after(()=>pool.end());
const settings={billing_enforcement_enabled:true,billing_mode:'test'};
const features=['calendar_exports','destination_essentials','pdf_exports'];
function dbFor(entitlement,subscription=null,owner=true){const statements=[];return {statements,execute:async(sql)=>{statements.push(sql);if(sql.includes('FROM trips'))return [owner?[{id:'trip'}]:[]];if(sql.includes('billing_trip_entitlements'))return [entitlement?[entitlement]:[]];if(sql.includes('billing_subscriptions'))return [subscription?[subscription]:[]];throw Error('Unexpected SQL');}};}
test('All new premium features reject Free with the existing structured paywall response',async()=>{
 for(const feature of features)await assert.rejects(requireFeature('user',feature,'trip',dbFor({source:'FREE'}),settings),error=>error.status===402&&error.billing.code==='PREMIUM_FEATURE_REQUIRED'&&error.billing.tripId==='trip'&&error.billing.allowTripPack);
});
test('Trip Pack, grants, grandfathering and Pro use existing access without consuming credits',async()=>{
 for(const source of ['TRIP_PACK','ADMIN_GRANT','LEGACY_GRANDFATHERED']){const db=dbFor({source});for(const feature of features)await requireFeature('user',feature,'trip',db,settings);assert(db.statements.every(sql=>sql.startsWith('SELECT')));}
 const db=dbFor({source:'FREE'},{status:'active',period_start:new Date(Date.now()-86400000),period_end:new Date(Date.now()+86400000)});for(const feature of features)await requireFeature('user',feature,'trip',db,settings);assert(db.statements.every(sql=>sql.startsWith('SELECT')));
});
test('Expired entitlement and cross-user access are rejected; existing enforcement pause is respected',async()=>{
 await assert.rejects(requireFeature('user','calendar_exports','trip',dbFor({source:'TRIP_PACK',expires_at:'2020-01-01T00:00:00Z'}),settings),error=>error.status===402);
 await assert.rejects(requireFeature('user','pdf_exports','trip',dbFor(null,null,false),settings),error=>error.status===404);
 await requireFeature('user','destination_essentials','trip',dbFor(null),{...settings,billing_enforcement_enabled:false});
});
