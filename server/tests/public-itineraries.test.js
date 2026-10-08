import test from 'node:test';
import assert from 'node:assert/strict';
import { DESTINATIONS } from '../public-itineraries/catalog.js';
import { sanitizeItinerary, seedState, seoMetadata, nearDuplicate, fingerprint, PublicationBlocked } from '../public-itineraries/sanitize.js';
import { renderItinerary } from '../public-itineraries/render.js';
import { catalogQuery, publicCard } from '../public-itineraries/service.js';
import { enabledPaymentMethods, publicPaymentMethods } from '../public-itineraries/payments.js';
const forbidden=['PRIVATE_PERSON_Κύριος','secret@private.example','2030-01-01','2030-01-04','PRIVATE_HOTEL_ADDRESS','FLIGHT-W6-SECRET','PNR-ZQX123','private-doc-url','private-owner-id','private-trip-id','private-place-id','PRIVATE_NOTE','PRIVATE_PHONE','passport-private'];
function fixture(){
  const state=seedState(DESTINATIONS[0]);
  Object.assign(state.trip,{id:forbidden[9],owner_id:forbidden[8],name:forbidden[0],share_public_itinerary:true,plan_status:'calculated',arrival_datetime:'2030-01-01T08:00',departure_datetime:'2030-01-04T23:00',arrival_location:forbidden[4],departure_location:forbidden[4],arrival_ticket_url:forbidden[7],notes:forbidden[11],email:forbidden[1],phone:forbidden[12],booking:forbidden[6],flight_number:forbidden[5],traveler:forbidden[13]});
  state.tripItems=[{id:'private-stay',category:'stay',address:forbidden[4],title:forbidden[4],date:state.trip.start_date,end_date:state.trip.end_date}];
  state.places=state.items.filter(i=>i.step_type==='visit').map((item,index)=>({id:forbidden[10]+index,name:item.title,notes:forbidden.join('|'),address:forbidden[4]}));
  let n=0;state.items=state.items.map(item=>({...item,id:'private-item-'+n,selection_id:item.step_type==='visit'?state.places[n++].id:null,notes:forbidden.join('|'),location:forbidden[4],source_url:forbidden[7],meal_choice:JSON.stringify({name:forbidden[4],url:forbidden[7],private:forbidden})}));
  state.user={email:'approved@travel.example',email_verified:true,public_itinerary_eligible:1,role:'USER',status:'ACTIVE'};return state;
}
test('Public allowlist excludes all private identity, date, booking, document, nested meal and source identifiers',()=>{
  const safe=sanitizeItinerary(fixture(),{ready:true});const seo=seoMetadata(safe.snapshot);
  const row={...seo,snapshot:safe.snapshot,public_id:'public-safe-id',city_key:'rome',slug:'4-day-itinerary',city:'Rome',country:'Italy',duration_days:4,persona:safe.snapshot.persona,intent:safe.snapshot.intent,indexable:true};
  const surfaces=[JSON.stringify(safe.snapshot),renderItinerary(row),JSON.stringify(publicCard(row))];
  for(const surface of surfaces)for(const secret of forbidden)assert(!surface.includes(secret),secret);
  assert.deepEqual(Object.keys(safe.snapshot).sort(),['version','city_key','city','country','duration_days','persona','intent','highlights','days','editorial_example','source_url'].sort());
  assert(safe.snapshot.days.every(d=>d.items.some(i=>i.kind==='meal')));
});
test('Eligibility fails closed for incomplete, unapproved, opt-out and unknown activities',()=>{
  const cases=[['sharing_disabled',s=>{s.trip.share_public_itinerary=false;}],['source_not_approved',s=>{s.user.public_itinerary_eligible=0;}],['source_not_approved',s=>{s.user.role='ADMIN';}],['source_not_approved',s=>{s.user.email='demo@example.com';}],['source_not_approved',s=>{s.user.email_verified=false;}],['source_not_approved',s=>{s.trip.is_sample=true;}],['trip_not_ready',s=>{s.trip.plan_status='draft';}],['private_details_incomplete',s=>{s.tripItems=[];}],['destination_not_reviewed',s=>{s.trip.destination='Unreviewed city';}],['insufficient_daily_content',s=>{s.items.splice(0,1);}],['unknown_activity_type',s=>{s.items[0].step_type='private-event';}],['unreviewed_place',s=>{s.places[0].name='Colosseum — PRIVATE PERSON';}],['invalid_dates',s=>{s.trip.start_date='2030-02-31';}],['invalid_schedule',s=>{s.items[0].start_time='25:00';}],['private_activity',s=>{s.places[0].trip_item_id='private-stay';}]];
  cases.push(['source_not_approved',s=>{s.trip.name='Rome test itinerary';}]);
  for(const [code,change] of cases){const state=fixture();change(state);assert.throws(()=>sanitizeItinerary(state,{ready:true}),e=>e instanceof PublicationBlocked&&e.code===code,code);}
  assert.throws(()=>sanitizeItinerary(fixture()),/trip_not_ready/);
});
test('All 15 editorial seeds pass the same sanitizer, have distinct metadata, complete schedules and safe HTML',()=>{
  const titles=new Set(),descriptions=new Set();
  assert.equal(DESTINATIONS.length,15);
  for(const d of DESTINATIONS){const safe=sanitizeItinerary(seedState(d),{seed:true}),seo=seoMetadata(safe.snapshot);assert(safe.quality>=85,d.city);assert(!titles.has(seo.title));assert(!descriptions.has(seo.description));titles.add(seo.title);descriptions.add(seo.description);assert(seo.description.length>=130&&seo.description.length<=175,`${d.city}: ${seo.description.length}`);assert.equal(safe.snapshot.days.length,d.days.length);
    for(const day of safe.snapshot.days){assert.equal(day.items.filter(i=>i.kind==='visit').length,2);assert.equal(day.items.filter(i=>i.kind==='meal').length,1);assert(day.items.every(i=>/^\d{2}:\d{2}$/.test(i.time)));}
    const html=renderItinerary({...seo,snapshot:safe.snapshot,city:d.city,country:d.country,city_key:d.key,slug:'example',public_id:'public-safe',duration_days:d.days.length,persona:d.persona,intent:d.intent,indexable:true});assert(html.includes('application/ld+json'));assert(!html.includes('2030-'));assert.equal((html.match(/<h1>/g)||[]).length,1);assert(!html.includes('AggregateRating'));assert(!html.includes('/api/uploads/'));
  }
});
test('Exact/near duplicates ignore private data and time changes but do not merge distinct destinations or durations',()=>{
  const a=sanitizeItinerary(fixture(),{ready:true}).snapshot,b=structuredClone(a);b.days[0].items[0].time='10:00';assert.equal(fingerprint(a),fingerprint(b));assert(nearDuplicate(a,b));b.city_key='paris';assert(!nearDuplicate(a,b));b.city_key='rome';b.duration_days=3;assert(!nearDuplicate(a,b));
});
test('Unknown filter keys, arrays, unreasonable limits and injection sorts are rejected',()=>{
  for(const query of [{limit:'100000'},{page:'0'},{duration:'1 OR 1=1'},{sort:'city; DROP TABLE trips'},{city:['rome','paris']},{owner_id:'secret'},{page:'1.5'}])assert.throws(()=>catalogQuery(query),e=>e.status===400);
  const q=catalogQuery({city:"Rome' OR 1=1 --",country:"Italy'",persona:'family',page:'2',limit:'9'});assert(!q.where.includes("Italy'"));assert(q.values.includes("Italy'"));assert.equal(q.offset,9);
});
test('Rendered text and structured data cannot break out into executable markup',()=>{
  const safe=sanitizeItinerary(seedState(DESTINATIONS[0]),{seed:true}),seo=seoMetadata(safe.snapshot),bad='</script><script>alert(1)</script><img onerror=alert(1)>';
  const html=renderItinerary({...seo,title:bad,h1:bad,snapshot:safe.snapshot,public_id:'safe',city:bad,city_key:'rome',country:'Italy',slug:'example',duration_days:4,persona:'family',intent:'culture',indexable:false});
  assert(!html.includes('<script>alert'));assert(!html.includes('<img onerror'));assert(html.includes('noindex, follow'));assert(html.includes('\\u003c'));
});
test('Overlapping meals and duplicate meal types are not promoted into a misleading public schedule',()=>{
  const state=fixture();state.items.push({step_type:'meal',date:state.trip.start_date,start_time:'10:00'},{step_type:'meal',date:state.trip.start_date,start_time:'13:00'});const safe=sanitizeItinerary(state,{ready:true});assert.equal(safe.snapshot.days[0].items.filter(i=>i.kind==='meal').length,1);
});
test('Payment badges use only active default configuration, matching mode, available and effective on methods',async()=>{
  const on={available:true,display_preference:{value:'on'}},off={available:true,display_preference:{value:'off'}},config={active:true,is_default:true,livemode:true,card:on,apple_pay:on,google_pay:off,paypal:{...on,available:false},pix:on};
  assert.deepEqual(enabledPaymentMethods(config,'live').map(m=>m.id),['card','apple_pay','pix']);assert.deepEqual(enabledPaymentMethods(config,'test'),[]);assert.deepEqual(enabledPaymentMethods({...config,active:false},'live'),[]);assert.deepEqual(enabledPaymentMethods({...config,is_default:false},'live'),[]);
  const methods=await publicPaymentMethods({settings:{billing_enabled:true,billing_mode:'live'},client:{paymentMethodConfigurations:{list:async()=>({data:[config]})}}});assert(methods.verified);assert.equal(methods.methods.length,3);
  assert.deepEqual(enabledPaymentMethods({...config,google_pay:on,paypal:on},'live').map(m=>m.id),['card','apple_pay','google_pay','paypal','pix']);
  const unavailable=await publicPaymentMethods({settings:{billing_enabled:true,billing_mode:'live'},client:{paymentMethodConfigurations:{list:async()=>{throw new Error('sk_live_PRIVATE');}}}});assert.deepEqual(unavailable,{methods:[],verified:false});
});
