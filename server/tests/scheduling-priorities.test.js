import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleItinerary, SCHEDULER_VERSION } from '../itinerary-engine.js';
import { eventInterval } from '../itinerary-time.js';
import { itineraryTimeLabel } from '../../src/lib/itinerary-time-label.js';
import { itineraryHtml } from '../itinerary-pdf.js';
import { present } from '../itinerary-service.js';
import { pool } from '../db.js';
test.after(()=>pool.end());
const fixture=()=>({trip:{id:'trip',name:'Bucharest nights',destination:'Bucharest',start_date:'2026-10-01',end_date:'2026-10-03',travel_type:'plane',arrival_datetime:'2026-10-01T22:22',arrival_location:'OTP',arrival_lat:44.5711,arrival_lng:26.085,departure_datetime:'2026-10-03T20:00',departure_location:'OTP',pace:'balanced',buffer_min:15,meal_duration_min:60,transport_preference:'taxi'},tripItems:[{id:'hotel',category:'stay',title:'Central hotel',address:'Central Bucharest',lat:44.415,lng:26.04,date:'2026-10-01',end_date:'2026-10-03',check_in_time:'15:00',check_out_time:'11:00'}],places:[],dayWindows:[],items:[]});
const place=(id,extra={})=>({id,name:'Place '+id,address:'Bucharest',priority:'preferred',selection_source:'ai',lat:44.43,lng:26.06,desired_duration_min:90,...extra});
test('Full datetimes preserve a 23:22 arrival transfer past midnight without a false warning',()=>{
 const state=fixture(),plan=scheduleItinerary(state),transfer=plan.items.find(i=>i.step_type==='transport');
 assert.equal(transfer.start_datetime,'2026-10-01T23:22');assert(transfer.end_datetime.startsWith('2026-10-02'));
 assert.equal(eventInterval(transfer).end-eventInterval(transfer).start,transfer.duration_min);
 assert(itineraryTimeLabel(transfer).includes('(+1 day)'));
 assert(!plan.items.some(i=>i.date==='2026-10-01'&&['free','meal','visit'].includes(i.step_type)));
 assert.deepEqual(plan.conflicts,[]);
});
test('Excess AI suggestions stay optional; feasible desired places take precedence and remain saved',async()=>{
 const state=fixture();state.places=[...Array.from({length:16},(_,i)=>place('optional-'+i)),place('desired',{priority:'mandatory',selection_source:'google'}),place('desired2',{selection_source:'manual'})];
 const original=JSON.stringify(state),plan=scheduleItinerary(state);
 assert.equal(JSON.stringify(state),original);assert.deepEqual(plan.conflicts,[]);
 for(const id of ['desired','desired2'])assert(plan.items.some(i=>i.selection_id===id));
 assert(plan.unscheduledOptional.length>0);assert(plan.unscheduledOptional.every(p=>p.selection_id.startsWith('optional')));
 assert.equal(plan.unscheduledOptional.length+plan.items.filter(i=>i.step_type==='visit').length,state.places.length);
 const loaded=await present({...state,items:plan.items,trip:{...state.trip,itinerary_meta:JSON.stringify({scheduler_version:SCHEDULER_VERSION,conflicts:plan.conflicts})}});
 assert.deepEqual(loaded.unscheduledOptional,plan.unscheduledOptional);assert.equal(loaded.requiresRegeneration,false);
 for(const day of ['2026-10-02','2026-10-03'])assert(plan.items.filter(i=>i.date===day&&i.step_type==='visit').length<=5);
});
test('An impossible desired place keeps exactly one actionable issue, not an optional notice',()=>{
 const state=fixture();state.places=[place('desired',{priority:'mandatory',selection_source:'google',fixed_date:'2026-10-01',desired_duration_min:480})];
 const plan=scheduleItinerary(state),issues=plan.conflicts.filter(c=>c.selection_id==='desired');
 assert.equal(issues.length,1);assert.equal(issues[0].code,'required_unscheduled');assert.match(issues[0].reason,/another day/);assert.equal(plan.unscheduledOptional.length,0);
});
test('Early departure logistics can begin the previous night and ignore discretionary hours',()=>{
 const state=fixture();state.trip.departure_datetime='2026-10-03T01:15';
 const plan=scheduleItinerary(state),departure=plan.items.find(i=>i.step_type==='departure');
 assert.equal(departure.start_datetime,'2026-10-02T23:15');assert.equal(departure.end_datetime,'2026-10-03T01:15');
 assert.deepEqual(plan.conflicts,[]);assert(!plan.items.some(i=>i.date==='2026-10-03'&&i.step_type==='visit'));
});
test('Confirmed bookings outside daily hours are retained, but explicit blocked-time overlaps remain actionable',()=>{
 const state=fixture();state.places=[place('booked',{fixed_date:'2026-10-02',fixed_time:'20:00',ticket_purchased:true})];
 state.dayWindows=[{date:'2026-10-02',windows:'[{"start":"09:30","end":"18:30"}]',blocked:'[{"start":"20:00","end":"21:00"}]'}];
 const plan=scheduleItinerary(state);assert.equal(plan.items.find(i=>i.selection_id==='booked').start_time,'20:00');assert(plan.conflicts.some(c=>c.code==='blocked_time'));assert.equal(plan.unscheduledOptional.length,0);
});
test('PDF contains travel content and overnight labels, never diagnostics even when they exist',()=>{
 const state=fixture(),plan=scheduleItinerary(state);plan.dates=['2026-10-01','2026-10-02','2026-10-03'];plan.conflicts=[{place:'SECRET_DEBUG_PLACE',reason:'Could not fit this selected place. INTERNAL_DIAGNOSTIC'}];plan.stale=true;
 const html=itineraryHtml(state.trip,plan,state.tripItems,state.places,[]);
 for(const forbidden of ['Planning details to review','SECRET_DEBUG_PLACE','INTERNAL_DIAGNOSTIC','Could not fit','Planning inputs changed'])assert(!html.includes(forbidden));
 assert(html.includes('Bucharest nights'));assert(html.includes('(+1 day)'));assert(html.includes('Day 3'));
});
test('A confirmed Wallet reservation is protected without a separate desired-place selection',()=>{
 const state=fixture();state.tripItems.push({id:'reservation',category:'place',title:'Reserved evening tour',address:'Bucharest',date:'2026-10-02',entry_time:'20:00',booking_status:'confirmed',visit_duration_min:60});
 const plan=scheduleItinerary(state),reservation=plan.items.find(i=>i.title==='Reservation · Reserved evening tour');
 assert.equal(reservation.start_time,'20:00');assert.equal(reservation.end_time,'21:00');assert.equal(reservation.locked,true);assert.deepEqual(plan.conflicts,[]);
});
test('A fixed booking outside the journey, and an invalid saved journey time, remain actionable',()=>{
 const state=fixture();state.places=[place('too-late',{fixed_date:'2026-10-03',fixed_time:'22:00',ticket_purchased:true})];
 assert(scheduleItinerary(state).conflicts.some(c=>c.code==='journey_visit_conflict'));
 state.trip.arrival_datetime='2026-10-01T99:00';assert(scheduleItinerary(state).conflicts.some(c=>c.code==='invalid_time'));
});
