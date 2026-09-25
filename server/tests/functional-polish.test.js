import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleItinerary } from '../itinerary-engine.js';
import { calculateChanges } from '../itinerary-changes.js';
import { itineraryHtml } from '../itinerary-pdf.js';
import { resolvePlace, placePhotos } from '../place-enrichment.js';
import { config } from '../config.js';
import { pool } from '../db.js';
test.after(()=>pool.end());
const state=()=>({trip:{id:'t',destination:'Bucharest',start_date:'2026-10-01',end_date:'2026-10-03',travel_type:'plane',arrival_datetime:'2026-10-01T22:22',arrival_location:'OTP',departure_datetime:'2026-10-03T20:00',departure_location:'OTP',special_wishes:'Keep one afternoon free and avoid early mornings.',pace:'balanced'},places:[{id:'a',name:'Garden',priority:'preferred',desired_duration_min:30,fixed_date:'2026-10-02',lat:44.44,lng:26.09},{id:'b',name:'Landmark',priority:'mandatory',desired_duration_min:45,fixed_date:'2026-10-03',fixed_time:'09:00',ticket_purchased:true,lat:44.44,lng:26.09}],tripItems:[{category:'stay',title:'Stay',address:'Central stay',lat:44.44,lng:26.09}],dayWindows:[],items:[]});
test('Late arrival buffer does not create a false midnight conflict; fixed tickets override planning hours',()=>{
 const data=state();data.dayWindows=[{date:'2026-10-03',windows:'[{"start":"12:00","end":"18:00"}]',blocked:'[]'}];
 const result=scheduleItinerary(data,[],null,{preferredWindows:[{date:'2026-10-02',windows:[{start:'10:00',end:'13:00'}]}]});
 assert(!result.conflicts.some(c=>c.place==='Arrival'));
 assert.equal(result.items.find(i=>i.selection_id==='b').start_time,'09:00');
 assert(result.items.filter(i=>i.date==='2026-10-02').every(i=>i.start_time>='10:00'&&i.end_time<='13:00'));
});
test('AI changes carry wishes and current schedule, preserve booked visits and leave snapshot untouched',async t=>{
 const old=[config.aiKey,config.aiModel];config.aiKey='fixture';config.aiModel='fixture';t.after(()=>{[config.aiKey,config.aiModel]=old;});
 const data=state();data.items=scheduleItinerary(data).items;
 const before=JSON.stringify(data);
 const answer=changes=>async(_endpoint,body)=>{
  const context=JSON.parse(body.input);assert.equal(context.trip.special_wishes,data.trip.special_wishes);assert(context.current_itinerary.length);assert(body.instructions.includes('smallest necessary'));assert.equal(body.store,false);
  return {output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Move the garden; free Day 2.',preferred_windows:[{date:'2026-10-02',windows:[{start:'10:00',end:'13:00'}]}],changes})}]}]};
 };
 const row={selection_id:'a',action:'move',date:'2026-10-03',start_time:'',name:'Garden',duration_min:30,reason:'Keep the second afternoon free.'};
 const result=await calculateChanges(data,'Move Garden from Day 2 to Day 3',answer([row]));
 assert.equal(JSON.stringify(data),before);assert.equal(result.items.find(i=>i.selection_id==='a').date,'2026-10-03');assert.equal(result.items.find(i=>i.selection_id==='b').start_time,'09:00');
 await assert.rejects(calculateChanges(data,'Move booked landmark',answer([{...row,selection_id:'b'}])),/protected/);
 await assert.rejects(calculateChanges(data,'Impossible day',answer([{...row,date:'2027-01-01'}])),/outside/);
});
test('Cross-midnight travel is retained and stays reserve check-in/out allowances',()=>{
 const data=state();data.trip.arrival_datetime='2026-10-01T23:30';data.tripItems[0]={...data.tripItems[0],date:'2026-10-01',end_date:'2026-10-03',check_in_time:'15:00',check_out_time:'11:00'};
 const result=scheduleItinerary(data);
 assert(result.items.some(i=>i.date==='2026-10-01'&&i.step_type==='arrival'&&i.end_datetime==='2026-10-02T00:30'));
 assert(!result.conflicts.some(c=>/midnight/i.test(c.reason)));
 assert(result.items.some(i=>i.date==='2026-10-02'&&i.step_type==='transport'&&i.start_time==='00:30'));
 assert(result.items.some(i=>i.title.startsWith('Check-out')&&i.end_time==='11:00'));
});
test('Place enrichment distinguishes ambiguous matches and photo URLs never contain the server key',async t=>{
 const old=config.googleMapsKey;config.googleMapsKey='PRIVATE_KEY';t.after(()=>{config.googleMapsKey=old;});
 const place={id:'google-id',displayName:{text:'Garden'},formattedAddress:'Bucharest',location:{latitude:44.44,longitude:26.09},addressComponents:[]};
 const fake=async(url,options)=>{assert.equal(options.headers['X-Goog-Api-Key'],'PRIVATE_KEY');return new Response(JSON.stringify(url.includes('searchText')?{places:[place]}:{photos:[{name:'places/google-id/photos/photo1',authorAttributions:[{displayName:'Author',uri:'https://maps.google.com/contrib/1'}]}]}));};
 assert.equal((await resolvePlace({name:'Garden',destination:'Bucharest'},fake)).place.place_id,'google-id');
 assert.equal((await resolvePlace({name:'Ambiguous translation',destination:'Bucharest'},fake)).place,null);
 const photos=await placePhotos('google-id','owner',fake);assert.equal(photos.length,1);assert(!JSON.stringify(photos).includes('PRIVATE_KEY'));assert.equal(photos[0].authors[0].name,'Author');
});
test('Dedicated PDF template escapes content and excludes private document paths and names',()=>{
 const data=state(),plan=scheduleItinerary(data);plan.dates=['2026-10-01','2026-10-02','2026-10-03'];
 data.trip.name='<script>unsafe</script>';data.trip.arrival_ticket_url='/api/uploads/private';
 const html=itineraryHtml(data.trip,plan,data.tripItems,data.places,[{category:'document',title:'SECRET_PASSPORT',attachments:[{file_url:'/api/uploads/private'}]}]);
 assert(html.includes('size:A4'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(!html.includes('/api/uploads/'));assert(!html.includes('SECRET_PASSPORT'));assert(html.includes('Day 3'));
});
