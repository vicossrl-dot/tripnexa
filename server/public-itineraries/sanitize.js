import { createHash } from 'node:crypto';
import { DESTINATIONS, approvedPlace, slugify, PERSONAS, INTENTS, MODES, MEALS } from './catalog.js';

export class PublicationBlocked extends Error { constructor(code) { super(code); this.code = code; } }
const requireSafe = (condition, code) => { if (!condition) throw new PublicationBlocked(code); };
export const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value;
const minute = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0,2))*60+Number(value.slice(3)) : null;
export const clockTime = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
export const fingerprint = snapshot => createHash('sha256').update(JSON.stringify({city:snapshot.city_key,days:snapshot.days.map(d=>d.items.filter(i=>i.kind==='visit').map(i=>i.place_key))})).digest('hex');
export function nearDuplicate(left, right) {
  if (left.city_key !== right.city_key || left.duration_days !== right.duration_days) return false;
  const places = value => new Set(value.days.flatMap(d=>d.items.filter(i=>i.kind==='visit').map(i=>i.place_key)));
  const a=places(left),b=places(right),common=[...a].filter(key=>b.has(key)).length;
  return common / new Set([...a,...b]).size >= .9;
}
export function sanitizeItinerary(state, { seed = false, ready = false } = {}) {
  const {trip, items = [], places = [], tripItems = [], user = {}} = state;
  requireSafe(seed || trip.share_public_itinerary === true || trip.share_public_itinerary === 1, 'sharing_disabled');
  requireSafe(seed || user.public_itinerary_eligible === 1 && user.role === 'USER' && user.status === 'ACTIVE' && !!user.email_verified && !/(?:@|\.)(?:test|invalid|localhost)$|@example\.(?:com|org|net)$|(?:^|[+._-])(?:test|sample|fixture|demo)(?:[+._-]|@)/i.test(user.email || '') && !trip.is_sample && !/\b(test|sample|demo|fixture|sandbox|debug)\b/i.test(trip.name||''), 'source_not_approved');
  requireSafe(seed || ready && !['draft','needs_verification'].includes(trip.plan_status), 'trip_not_ready');
  const destination=DESTINATIONS.find(d=>slugify(d.city)===slugify(trip.destination_city||trip.destination)&&slugify(d.country)===slugify(trip.country));
  requireSafe(destination,'destination_not_reviewed');
  const dates = [];
  requireSafe(/^\d{4}-\d{2}-\d{2}$/.test(trip.start_date||'') && /^\d{4}-\d{2}-\d{2}$/.test(trip.end_date||''), 'dates_missing');
  const first=Date.parse(trip.start_date+'T00:00:00Z'),last=Date.parse(trip.end_date+'T00:00:00Z'),duration=(last-first)/86400000+1;
  requireSafe(Number.isFinite(first)&&Number.isFinite(last)&&new Date(first).toISOString().slice(0,10)===trip.start_date&&new Date(last).toISOString().slice(0,10)===trip.end_date,'invalid_dates');
  requireSafe(Number.isInteger(duration)&&duration>=1&&duration<=14,'duration_not_supported');
  for(let i=0;i<duration;i++)dates.push(new Date(first+i*86400000).toISOString().slice(0,10));
  requireSafe(seed || !!trip.arrival_datetime && !!trip.departure_datetime && tripItems.some(i=>i.category==='stay'&&i.address&&i.date&&i.end_date), 'private_details_incomplete');
  requireSafe(items.length>0 && items.length<=1000,'empty_or_oversized');
  const allowedKinds=new Set(['visit','transport','meal','break','free','transfer','arrival','departure','access']);
  requireSafe(items.every(i=>allowedKinds.has(i.step_type)),'unknown_activity_type');
  const seen=new Set();
  const days=dates.map((date,index)=>{
    const visits=items.filter(i=>i.date===date&&i.step_type==='visit').sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)));
    requireSafe(visits.length>=2&&visits.length<=10,'insufficient_daily_content');
    let previousEnd=0;
    const safeVisits=visits.map(item=>{
      const selection=places.find(p=>p.id===item.selection_id);
      requireSafe(!selection?.trip_item_id || !tripItems.some(p=>p.id===selection.trip_item_id&&p.category!=='place'),'private_activity');
      const place=approvedPlace(destination,selection?.name||item.title);
      requireSafe(place,'unreviewed_place');
      const start=minute(item.start_time),minutes=Number(item.duration_min);
      requireSafe(start!==null&&Number.isInteger(minutes)&&minutes>=15&&minutes<=300&&start>=previousEnd&&start+minutes<=23*60,'invalid_schedule');
      previousEnd=start+minutes;
      requireSafe(!seen.has(place.key),'repeated_place'); seen.add(place.key);
      return {kind:'visit',place_key:place.key,name:place.name,area:place.area,description:place.note,time:clockTime(start),duration_min:minutes};
    });
    const safeExtras=[];
    for(const item of items.filter(i=>i.date===date&&i.step_type==='meal')) {
      const time=minute(item.start_time); if(time===null)continue;
      const type=time<11*60?'breakfast':time<16*60?'lunch':'dinner';
      if(time+60>23*60||safeExtras.some(meal=>meal.meal===type)||safeVisits.some(visit=>time<minute(visit.time)+visit.duration_min&&time+60>minute(visit.time)))continue;
      // Never copy restaurant free text, addresses, dietary notes or opaque meal JSON.
      safeExtras.push({kind:'meal',meal:type,name:MEALS[type],time:clockTime(time),duration_min:60});
    }
    const transport=MODES[trip.transport_preference]?trip.transport_preference:'transit';
    const editorial=seed?destination.days[index]:null;
    return {number:index+1,heading:editorial?.title||[...new Set(safeVisits.map(i=>i.area))].join(' & '),note:editorial?.note||`Give ${safeVisits.map(i=>i.name).join(' and ')} time of their own, with breaks between visits.`,transport:editorial?.transport||transport,items:[...safeVisits,...safeExtras].sort((a,b)=>a.time.localeCompare(b.time))};
  });
  const persona=seed?destination.persona:({family:'family',couple:'couples',solo:'solo',friends:'friends'}[trip.trip_type]||'first-time');
  const intent=seed?destination.intent:trip.pace==='relaxed'?'relaxed':'sightseeing';
  requireSafe(PERSONAS[persona]&&INTENTS[intent],'invalid_classification');
  const highlights=days.flatMap(d=>d.items.filter(i=>i.kind==='visit').map(i=>i.name)).slice(0,4);
  const result={version:1,city_key:destination.key,city:destination.city,country:destination.country,duration_days:duration,persona,intent,highlights,days,editorial_example:seed,source_url:destination.source};
  return {snapshot:result,quality:Math.min(100,70+seen.size*2+duration),hash:fingerprint(result)};
}
export function seoMetadata(snapshot, variant = '') {
  const {city,duration_days:duration,persona,highlights}=snapshot;
  const family=persona==='family';
  const h1=family?`${city} with kids: a ${duration}-day itinerary${variant?' — '+variant:''}`:`${duration} days in ${city}${variant?`: ${variant}`:''}`;
  const title=family?`${city} Family Itinerary: ${duration} Days with Kids${variant?' — '+variant:''} | TripNexa`:`${city} ${duration}-Day Itinerary${variant?': '+variant:': A Day-by-Day Travel Plan'} | TripNexa`;
  const lead=`Explore ${city} in ${duration} days with ${highlights.slice(0,2).join(', ')}${variant?' and '+variant.toLowerCase():''}.`;
  const endings=[' Follow the day-by-day stops, meal breaks and travel ideas. Customize your plan in TripNexa.',' See the day-by-day stops and meal breaks, then customize your plan in TripNexa.',' See the daily plan, then customize it for your dates in TripNexa.',' Customize the day-by-day plan in TripNexa.'];
  const description=lead+(endings.find(ending=>lead.length+ending.length<=160)||endings.at(-1));
  const introduction=snapshot.editorial_example?DESTINATIONS.find(d=>d.key===snapshot.city_key).summary:`This ${duration}-day ${city} plan includes ${highlights.slice(0,3).join(', ')}. Follow the day-by-day structure, then adjust the pace and stops around your own trip.`;
  return {title,description:description.length<=175?description:`Explore ${city} in ${duration} days with a ${PERSONAS[persona].toLowerCase()} itinerary${variant?' featuring '+variant:''}. See the daily stops, meal breaks and travel ideas, then customize it in TripNexa.`,h1,introduction};
}
export function seedState(destination) {
  const start='2030-01-01',dateAt=day=>new Date(Date.parse(start+'T00:00:00Z')+day*86400000).toISOString().slice(0,10);
  return {trip:{destination:destination.city,country:destination.country,start_date:start,end_date:dateAt(destination.days.length-1)},items:destination.days.flatMap((day,index)=>[
    ...day.stops.map((place,i)=>({step_type:'visit',date:dateAt(index),title:place.name,start_time:i?'14:30':'09:30',duration_min:place.minutes})),
    {step_type:'meal',date:dateAt(index),start_time:'12:45'},
  ])};
}
