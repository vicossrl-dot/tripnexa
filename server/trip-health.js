import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {rateLimit} from 'express-rate-limit';
import {pool,transaction} from './db.js';
import {snapshot,present,revision,inputHash,persist,readItinerary} from './itinerary-service.js';
import {selectedPlaces,isRequiredPlace,tripDates} from './itinerary-engine.js';
import {scheduleWithProviders} from './scheduling-data.js';
import {preserveMealChoices} from './meal-context.js';
import {insertRecord} from './entities.js';
import {assert} from './errors.js';

export function healthSummary(state,plan,walletFiles=0,now=new Date()){
 const trip=state.trip,issues=[],checks=[];
 const add=(title,action,step,severity='attention')=>issues.push({title,action,href:step.startsWith('/')?step:`/trip/${trip.id}/plan?step=${step}`,severity});
 const check=(title,ready,optional=false)=>checks.push({title,ready,optional});
 check('Destination',!!trip.destination);if(!trip.destination)add('Choose your destination','Add destination','0','blocked');
 let validDates=true;try{tripDates(trip);}catch{validDates=false;}
 check('Travel dates',validDates);if(!validDates)add('Confirm your travel dates','Update dates','0','blocked');
 check('Travelers',Number(trip.adults)>0);if(!(Number(trip.adults)>0))add('Confirm who is traveling','Add travelers','0');
 check('Travel type',!!trip.travel_type,true);
 const stays=state.tripItems.filter(i=>i.category==='stay');
 if(stays.length){check('Accommodation address',stays.every(i=>!!i.address));if(stays.some(i=>!i.address))add('Your accommodation needs an address for transfer planning','Complete hotel address','1');}
 else check('Accommodation (if needed)',false,true);
 const journey=['plane','train','bus','ship'].includes(trip.travel_type)||trip.arrival_datetime||trip.departure_datetime;
 if(journey)for(const side of ['arrival','departure']){check(side==='arrival'?'Arrival information':'Departure information',!!trip[side+'_datetime']&&!!trip[side+'_location']);if(!trip[side+'_datetime']||!trip[side+'_location'])add(`Confirm your ${side} time and location`,`Update ${side}`,'0');}
 const required=selectedPlaces(state).places.filter(isRequiredPlace),unresolved=required.filter(p=>!p.address||p.lat==null||p.lng==null);
 if(unresolved.length)add(`${unresolved.length} must-see ${unresolved.length===1?'place needs':'places need'} an exact location`,'Confirm locations','3');
 check('Must-see locations',!unresolved.length);
 if(!state.items.length)add('Your day-by-day itinerary is not ready yet','Build itinerary','5');
 else if(plan.stale)add('Your itinerary was created before your latest changes','Review update',`/trip/${trip.id}#trip-health`,'update');
 else if(plan.requiresRegeneration)add('An improved itinerary calculation is available','Review update',`/trip/${trip.id}#trip-health`,'update');
 for(const conflict of plan.conflicts||[]){
  if(conflict.code==='unresolved_location'&&unresolved.length)continue;
  const step=['stay_address','stay_dates'].includes(conflict.code)?'1':conflict.code==='required_unscheduled'?'3':['missing_arrival_time','missing_departure_time','journey_date','invalid_time','journey_overlap'].includes(conflict.code)?'0':'2';
  add(conflict.reason||'One activity needs a time review','Review details',step,['journey_overlap','journey_visit_conflict','invalid_duration'].includes(conflict.code)?'blocked':'attention');
 }
 check('Itinerary current',!!state.items.length&&!plan.stale&&!plan.requiresRegeneration&&!plan.conflicts.length);
 check('Tickets and documents saved',walletFiles>0,true);
 const unique=[...new Map(issues.map(i=>[i.title,i])).values()],attention=unique.filter(i=>i.severity!=='update');
 const status=unique.some(i=>i.severity==='blocked')?'BLOCKED':attention.length?'NEEDS ATTENTION':unique.length?'UPDATE AVAILABLE':'READY';
 const days=Math.ceil((Date.parse(trip.start_date+'T00:00:00Z')-now.getTime())/86400000);
 const beforeGo=[];
 if(stays.some(i=>i.booking_status==='confirmed'||i.reservation_file_url))beforeGo.push({title:'Hotel reservation saved',ready:true,href:`/trip/${trip.id}/wallet?category=stay`});
 if(state.items.length)beforeGo.push({title:plan.stale?'Review the latest itinerary changes':'Itinerary saved',ready:!plan.stale,href:`/trip/${trip.id}/itinerary`});
 if(walletFiles)beforeGo.push({title:`${walletFiles} travel ${walletFiles===1?'file':'files'} saved`,ready:true,href:`/trip/${trip.id}/wallet`});
 if(journey&&!trip.departure_datetime)beforeGo.push({title:'Confirm departure time',ready:false,href:`/trip/${trip.id}/plan?step=0`});
 if(state.items.some(i=>i.ticket_status==='needed'))beforeGo.push({title:'Check tickets for your planned visits',ready:false,href:`/trip/${trip.id}/wallet?category=place`});
 if(unresolved.length)beforeGo.push({title:'Confirm your must-see locations',ready:false,href:`/trip/${trip.id}/plan?step=3`});
 return {status,issues:unique,checks,nextActions:unique.slice(0,3),optionalSaved:plan.unscheduledOptional.length,beforeGo,nearDeparture:days>=0&&days<=14,canRepair:validDates&&!!trip.destination&&state.items.length>0&&state.places.length<=200};
}
export async function readHealth(tripId,ownerId){
 const state=await transaction(db=>snapshot(db,tripId,ownerId)),plan=await present(state);
 const [[count]]=await pool.execute('SELECT COUNT(*) AS total FROM item_attachments a JOIN trip_items i ON i.id=a.item_id AND i.owner_id=a.owner_id WHERE i.trip_id=? AND i.owner_id=?',[tripId,ownerId]);
 const [history]=await pool.execute('SELECT id,after_revision FROM itinerary_repair_history WHERE trip_id=? AND owner_id=? AND undone=FALSE ORDER BY created_at DESC LIMIT 1',[tripId,ownerId]);
 return {...healthSummary(state,plan,count.total),undoToken:history[0]?.after_revision===revision(state)?history[0].id:null};
}
const previews=new Map();
export async function previewRepair(tripId,ownerId){
 const state=await transaction(db=>snapshot(db,tripId,ownerId));
 assert(state.items.length,409,'Build your first itinerary before reviewing an update.');assert(state.places.length<=200,400,'Please ask support to review this unusually large plan.');
 const result=await scheduleWithProviders(state);preserveMealChoices(state,result.items);
 for(const item of state.items.filter(i=>i.locked&&i.step_type==='visit')){const kept=result.items.find(i=>i.selection_id===item.selection_id);assert(kept&&kept.date===item.date&&kept.start_time===item.start_time&&kept.end_time===item.end_time,409,'This update would change a confirmed visit. Review its reservation in your plan first.');}
 for(const [key,p] of previews)if(p.expires<Date.now()||p.ownerId===ownerId)previews.delete(key);
 assert(previews.size<200,503,'Updates are busy. Please try again shortly.');
 const token=randomUUID();previews.set(token,{tripId,ownerId,before:revision(state),result,expires:Date.now()+10*60000});
 const moved=result.items.filter(i=>i.step_type==='visit').filter(i=>{const old=state.items.find(p=>p.selection_id===i.selection_id&&p.step_type==='visit');return old&&(old.date!==i.date||old.start_time!==i.start_time);}).length;
 return {token,before:state.items.length,after:result.items.length,changes:[`${result.items.filter(i=>i.step_type==='transport').length} transfers recalculated`,`${moved} ${moved===1?'visit changes':'visits change'} day or time`,`${result.unscheduledOptional.length} optional places remain saved for later`],issues:result.conflicts.map(i=>i.reason),unchanged:['Confirmed bookings','Travel Wallet files','Trip dates','Desired Places','Preferences','Special Wishes'],expiresInMinutes:10};
}
export async function applyRepair(tripId,ownerId,token){
 const undoToken=await transaction(async db=>{
  const state=await snapshot(db,tripId,ownerId,true),preview=previews.get(token);
  assert(preview&&preview.tripId===tripId&&preview.ownerId===ownerId&&preview.expires>Date.now(),409,'This preview expired. Preview the update again; your itinerary is unchanged.');
  assert(revision(state)===preview.before,409,'This itinerary changed in another session. Reload it and preview the update again.');
  const id=randomUUID();await persist(db,state,preview.result,{generation:'local-repair',message:'Updated from your saved plan. Review any remaining travel details.'});
  const after=await snapshot(db,tripId,ownerId);
  await db.execute('INSERT INTO itinerary_repair_history(id,trip_id,owner_id,previous_state,after_revision,input_hash)VALUES(?,?,?,?,?,?)',[id,tripId,ownerId,JSON.stringify({items:state.items,meta:state.trip.itinerary_meta,status:state.trip.plan_status}),revision(after),inputHash(state)]);
  return id;
 });previews.delete(token);return {ok:true,undoToken};
}
export async function undoRepair(tripId,ownerId,token){
 await transaction(async db=>{
  const state=await snapshot(db,tripId,ownerId,true);
  const [[saved]]=await db.execute('SELECT * FROM itinerary_repair_history WHERE id=? AND trip_id=? AND owner_id=? AND undone=FALSE FOR UPDATE',[String(token||''),tripId,ownerId]);
  assert(saved&&saved.after_revision===revision(state)&&saved.input_hash===inputHash(state),409,'Your trip changed after this update. Undo is no longer available; your current plan is safe.');
  const previous=typeof saved.previous_state==='string'?JSON.parse(saved.previous_state):saved.previous_state;
  await db.execute('DELETE FROM itinerary_items WHERE trip_id=? AND owner_id=?',[tripId,ownerId]);
  const version=(state.trip.plan_version||0)+1;
  for(const item of previous.items)await insertRecord(db,'ItineraryItem',{...item,version},ownerId,{id:item.id,internal:true});
  await db.execute('UPDATE trips SET itinerary_meta=?,plan_status=?,plan_version=? WHERE id=? AND owner_id=?',[previous.meta,previous.status,version,tripId,ownerId]);
  await db.execute('UPDATE itinerary_repair_history SET undone=TRUE WHERE id=?',[saved.id]);
 });return readItinerary(tripId,ownerId);
}
export const healthRouter=Router();
healthRouter.get('/:id/health',async(req,res)=>res.json(await readHealth(req.params.id,req.user.id)));
healthRouter.post('/:id/repair/preview',rateLimit({windowMs:60000,limit:5,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>res.json(await previewRepair(req.params.id,req.user.id)));
healthRouter.post('/:id/repair/apply',async(req,res)=>res.json(await applyRepair(req.params.id,req.user.id,req.body.token)));
healthRouter.post('/:id/repair/undo',async(req,res)=>res.json(await undoRepair(req.params.id,req.user.id,req.body.token)));
