import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleItinerary} from '../itinerary-engine.js';
import {openingWindows} from '../place-hours.js';
import {healthSummary} from '../trip-health.js';
import {inputHash} from '../itinerary-service.js';
import {routeEstimate,scheduleWithProviders} from '../scheduling-data.js';
import {config} from '../config.js';
import {pool} from '../db.js';
test.after(()=>pool.end());
const state=()=>({trip:{id:'trip',destination:'Rome',start_date:'2026-10-05',end_date:'2026-10-06',adults:1,transport_preference:'mixed',meal_duration_min:0,buffer_min:0},places:[{id:'museum',name:'Museum',priority:'mandatory',address:'Rome',lat:41.9,lng:12.5,desired_duration_min:60}],tripItems:[{id:'hotel',category:'stay',address:'Rome hotel',lat:41.9,lng:12.49}],dayWindows:[],items:[]});
const hours={regularOpeningHours:{periods:[{open:{day:1,hour:14},close:{day:1,hour:17}}]}};
test('Known hours move a flexible visit into an open window; closed places are not scheduled',()=>{
 const data=state();data.places[0].__hours=hours;const plan=scheduleItinerary(data),visit=plan.items.find(i=>i.selection_id==='museum');assert(visit.start_time>='14:00'&&visit.end_time<='17:00');
 for(const businessStatus of ['CLOSED_PERMANENTLY','CLOSED_TEMPORARILY']){data.places[0].__hours={businessStatus};assert(!scheduleItinerary(data).items.some(i=>i.selection_id==='museum'));}
});
test('Unknown opening hours allow visits and confirmed reservations stay fixed with a review warning',()=>{
 const data=state(),plan=scheduleItinerary(data);assert.match(plan.items.find(i=>i.selection_id==='museum').notes,/not verified/);
 Object.assign(data.places[0],{__hours:hours,fixed_date:'2026-10-05',fixed_time:'18:00',ticket_purchased:true});const fixed=scheduleItinerary(data);assert.equal(fixed.items.find(i=>i.selection_id==='museum').start_time,'18:00');assert(fixed.conflicts.some(c=>c.code==='booking_hours'));
});
test('Opening periods support overnight, 24 hours, explicit empty and missing data',()=>{
 assert.equal(openingWindows({},'2026-10-05'),null);assert.deepEqual(openingWindows({regularOpeningHours:{periods:[]}},'2026-10-05'),[]);
 assert.deepEqual(openingWindows({regularOpeningHours:{periods:[{open:{day:0,hour:0}}]}},'2026-10-05'),[{start:0,end:1440}]);
 assert.deepEqual(openingWindows({regularOpeningHours:{periods:[{open:{day:0,hour:22},close:{day:1,hour:2}}]}},'2026-10-05'),[{start:0,end:120}]);
});
test('Readiness is a checklist: optional unscheduled ideas and absent documents do not create an error',()=>{
 const data=state();data.items=scheduleItinerary(data).items;const plan={items:data.items,stale:false,requiresRegeneration:false,conflicts:[],unscheduledOptional:[{name:'Optional'}]};
 assert.equal(healthSummary(data,plan).status,'READY');data.places[0].lat=null;const health=healthSummary(data,plan);assert.equal(health.status,'NEEDS ATTENTION');assert(health.issues.some(i=>i.title.includes('exact location')));assert.equal(health.nextActions.length,1);
});
test('Adding private documents and unbooked Wallet tickets does not invalidate the itinerary',()=>{
 const data=state(),before=inputHash(data);data.tripItems.push({id:'doc',category:'document',title:'Passport'},{id:'ticket',category:'place',title:'Ticket file'});assert.equal(inputHash(data),before);
 data.tripItems[2].booking_status='confirmed';assert.notEqual(inputHash(data),before);
});
test('Google route failures fall back; identical route requests are cached within one operation',async t=>{
 const old=config.googleMapsKey;config.googleMapsKey='fixture';const oldEnabled=process.env.GOOGLE_ROUTES_ENABLED;process.env.GOOGLE_ROUTES_ENABLED='true';t.after(()=>{config.googleMapsKey=old;if(oldEnabled===undefined)delete process.env.GOOGLE_ROUTES_ENABLED;else process.env.GOOGLE_ROUTES_ENABLED=oldEnabled;});
 const data=state(),calls=new Set();const fake=async(url,options)=>{assert(url.includes('computeRoutes'));assert(!calls.has(options.body));calls.add(options.body);return new Response(JSON.stringify({routes:[{duration:'480s'}]}));};
 const result=await scheduleWithProviders(data,[],null,{},fake);assert(calls.size>0);assert(result.items.some(i=>i.source_status==='api_provided'));
 assert.equal(await routeEstimate(data.tripItems[0],data.places[0],'walk',async()=>{throw Error('network');}),null);
});
