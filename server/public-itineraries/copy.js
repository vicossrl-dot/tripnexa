import { Router } from 'express';
import { transaction } from '../db.js';
import { insertRecord, owned } from '../entities.js';
import { assert } from '../errors.js';
import { recordEvent } from '../admin/telemetry.js';
import { queuePublicItinerary } from './queue.js';
import { loadPublic } from './service.js';
import { parseJson, clockTime } from './sanitize.js';
import { destinationByKey } from './catalog.js';
import { readSettings } from '../admin/settings.js';

export async function copyPublicItinerary(ownerId, publicId) {
  return transaction(async db=>{
    // Same lock/order as existing trip creation; repeat clicks use one owned copy.
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[ownerId]);
    const source=await loadPublic(db,publicId);assert(source,404,'This public itinerary is no longer available.');
    const [[existing]]=await db.execute('SELECT trip_id FROM public_itinerary_copies WHERE owner_id=? AND public_id=?',[ownerId,publicId]);
    if(existing)return {trip_id:existing.trip_id,created:false};
    const template=parseJson(source.snapshot),destination=destinationByKey(template.city_key);
    const currency={Italy:'EUR',France:'EUR',Spain:'EUR',Netherlands:'EUR',Portugal:'EUR',Austria:'EUR','United Kingdom':'GBP','United States':'USD',Japan:'JPY','United Arab Emirates':'AED','Türkiye':'TRY',Czechia:'CZK',Singapore:'SGD',Thailand:'THB'}[template.country];
    const trip=await insertRecord(db,'Trip',{name:`${template.duration_days} days in ${template.city}`,destination:template.city,destination_city:template.city,country:template.country,destination_latitude:destination.latitude,destination_longitude:destination.longitude,timezone:destination.timezone,currency,trip_type:({family:'family',couples:'couple',solo:'solo',friends:'friends'}[template.persona]||'solo'),pace:template.intent==='relaxed'?'relaxed':'balanced',transport_preference:'mixed',plan_status:'draft',planning_step:0,share_enabled:false,share_public_itinerary:true,itinerary_meta:JSON.stringify({generation:'public-example-pending',template_days:template.duration_days})},ownerId,{internal:true});
    const map={};
    for(const item of template.days.flatMap(day=>day.items).filter(item=>item.kind==='visit')) {
      const place=await insertRecord(db,'PlaceSelection',{trip_id:trip.id,name:item.name,address:`${item.name}, ${item.area}, ${template.city}, ${template.country}`,city:template.city,country:template.country,area:item.area,priority:'preferred',desired_duration_min:item.duration_min,selection_source:'manual',status:'unresolved',ticket_type:'none'},ownerId);
      map[item.place_key]=place.id;
    }
    await db.execute('INSERT INTO public_itinerary_copies(owner_id,public_id,trip_id,template,place_map)VALUES(?,?,?,?,?)',[ownerId,publicId,trip.id,JSON.stringify(template),JSON.stringify(map)]);
    return {trip_id:trip.id,created:true};
  });
}
export async function materializePublicTemplate(db,tripId,ownerId) {
  const [[copy]]=await db.execute('SELECT * FROM public_itinerary_copies WHERE trip_id=? AND owner_id=? AND materialized=FALSE FOR UPDATE',[tripId,ownerId]);
  if(!copy)return;
  const trip=await owned(db,'Trip',tripId,ownerId);
  if(!trip.start_date||!trip.end_date)return;
  const template=parseJson(copy.template),map=parseJson(copy.place_map),start=Date.parse(trip.start_date+'T00:00:00Z'),end=Date.parse(trip.end_date+'T00:00:00Z');
  if(!Number.isFinite(start)||end-start<(template.duration_days-1)*86400000)return;
  const [[{count}]]=await db.execute('SELECT COUNT(*) AS count FROM itinerary_items WHERE trip_id=? AND owner_id=?',[tripId,ownerId]);
  if(count){await db.execute('UPDATE public_itinerary_copies SET materialized=TRUE WHERE trip_id=?',[tripId]);return;}
  for(const day of template.days) {
    const date=new Date(start+(day.number-1)*86400000).toISOString().slice(0,10);
    const [[window]]=await db.execute('SELECT id FROM day_windows WHERE trip_id=? AND date=?',[tripId,date]);
    if(!window)await insertRecord(db,'DayWindow',{trip_id:tripId,date,windows:'[{"start":"09:00","end":"19:00"}]',blocked:'[]'},ownerId);
    for(const [index,item]of day.items.entries()) {
      const selection=map[item.place_key];
      if(selection){const [[present]]=await db.execute('SELECT id FROM place_selections WHERE id=? AND trip_id=? AND owner_id=?',[selection,tripId,ownerId]);if(!present)continue;
        await db.execute('UPDATE place_selections SET fixed_date=?,fixed_time=? WHERE id=? AND trip_id=? AND owner_id=?',[date,item.time,selection,tripId,ownerId]);}
      const minute=Number(item.time.slice(0,2))*60+Number(item.time.slice(3));
      await insertRecord(db,'ItineraryItem',{trip_id:tripId,date,sort_order:index,step_type:item.kind==='visit'?'visit':'meal',title:item.name,start_time:item.time,end_time:clockTime(minute+item.duration_min),duration_min:item.duration_min,selection_id:selection||null,source_status:'estimated',locked:false,ticket_status:'to_verify',route_mode:day.transport==='walk'?'walk':'transit'},ownerId,{internal:true});
    }
  }
  // Explicitly unoptimized: the existing Update Plan flow remains responsible for scheduling.
  await db.execute('UPDATE trips SET itinerary_meta=?,plan_status=? WHERE id=? AND owner_id=?',[JSON.stringify({generation:'public-example',template_days:template.duration_days,scheduler_version:0,conflicts:[],message:'Example schedule. Add your travel details, then use Update Plan to review and optimize it.'}),'draft',tripId,ownerId]);
  await db.execute('UPDATE public_itinerary_copies SET materialized=TRUE WHERE trip_id=?',[tripId]);
  await queuePublicItinerary(db,tripId);
}
export const customizationRouter=Router();
customizationRouter.use(async(_req,_res,next)=>{const all=await readSettings();assert(all.features.public_sharing&&!all.settings.maintenance_enabled,503,'Public examples are temporarily unavailable.');next();});
customizationRouter.get('/intent',async(req,res)=>{
  const id=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('tripnexa_public_intent='))?.split('=')[1];
  const {pool}=await import('../db.js');
  res.json({returnTo:id&&/^[a-f0-9-]{36}$/.test(id)&&await loadPublic(pool,id)?`/customize/${id}`:'/'});
});
customizationRouter.post('/:id/copy',async(req,res)=>{
  assert(/^[a-f0-9-]{36}$/.test(req.params.id),404,'Public itinerary not found.');
  const result=await copyPublicItinerary(req.user.id,req.params.id);
  res.clearCookie('tripnexa_public_intent',{path:'/',httpOnly:true,sameSite:'lax'});
  if(result.created)void recordEvent('public_itinerary_clone_created',null);
  res.status(result.created?201:200).json({...result,redirect:`/trip/${result.trip_id}/plan?step=0`});
});
