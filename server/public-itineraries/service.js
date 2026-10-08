import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pool, transaction } from '../db.js';
import { assert } from '../errors.js';
import { DESTINATIONS, slugify } from './catalog.js';
import { parseJson, sanitizeItinerary, seoMetadata, nearDuplicate, seedState, PublicationBlocked } from './sanitize.js';

export const PUBLIC_ORIGIN = 'https://my.tripnexa.app';
export const routeFor = row => `/trips/${row.city_key}/${row.slug}`;
export const canonicalFor = row => PUBLIC_ORIGIN + routeFor(row);
// Only a visibility gate joins the source: rendering always uses the separate snapshot.
export const visibleWhere = "p.status='published' AND p.admin_hidden=FALSE AND (p.seed_key IS NOT NULL OR (t.share_public_itinerary=TRUE AND u.public_itinerary_eligible=TRUE AND u.role='USER' AND u.status='ACTIVE'))";
export const sourceJoins = 'LEFT JOIN trips t ON t.id=p.source_trip_id LEFT JOIN users u ON u.id=t.owner_id';
export function publicCard(row) {
  const data=parseJson(row.snapshot);
  return {public_id:row.public_id,title:row.h1,slug:row.slug,canonical_url:canonicalFor(row),city:row.city,country:row.country,duration:row.duration_days,persona:row.persona,intent:row.intent,description:row.introduction,highlights:data.highlights,editorial_example:data.editorial_example,image_url:`${PUBLIC_ORIGIN}/public-itinerary-assets/${row.city_key}.svg`};
}
export async function loadPublic(db, id) {
  const [[row]]=await db.execute(`SELECT p.* FROM public_itineraries p ${sourceJoins} WHERE p.public_id=? AND ${visibleWhere}`,[id]);
  return row || null;
}
export async function publishSnapshot(db, safe, {tripId=null,seedKey=null}={}) {
  await db.query('SELECT id FROM public_itinerary_publication_lock WHERE id=1 FOR UPDATE');
  const [[old]]=await db.execute('SELECT * FROM public_itineraries WHERE source_trip_id=? OR seed_key=? FOR UPDATE',[tripId,seedKey]);
  const data=safe.snapshot;
  const [others]=await db.execute(`SELECT p.* FROM public_itineraries p ${sourceJoins} WHERE p.city_key=? AND p.duration_days=? AND p.indexable=TRUE AND ${visibleWhere} AND p.public_id<>? ORDER BY p.created_at,p.public_id`,[data.city_key,data.duration_days,old?.public_id||'']);
  const duplicate=others.find(row=>nearDuplicate(parseJson(row.snapshot),data));
  const base=`${data.duration_days}-day${data.persona==='family'?'-family':''}-itinerary`;
  const keepRoute=old&&old.city_key===data.city_key&&old.duration_days===data.duration_days;
  let slug=keepRoute?old.slug:base,variant='';
  if(!keepRoute)for(let attempt=0;attempt<1000;attempt++) {
    const [[existing]]=await db.execute('SELECT public_id FROM public_itineraries WHERE city_key=? AND slug=?',[data.city_key,slug]);
    if(!existing||existing.public_id===old?.public_id)break;
    variant=attempt===0?`${data.persona} ${data.intent}`:attempt===1?data.highlights[0]:`${data.highlights[0]} route ${attempt}`;
    slug=`${data.duration_days}-day-${slugify(variant)}-itinerary`.slice(0,180);
  }
  if(keepRoute && old.slug!==base)variant=old.h1.startsWith(`${data.duration_days} days in ${data.city}: `)?old.h1.split(': ').slice(1).join(': '):old.h1.includes(' — ')?old.h1.split(' — ').slice(1).join(' — '):data.highlights[0];
  const seo=seoMetadata(data,variant);
  const indexable=!duplicate&&!old?.forced_noindex&&!old?.admin_hidden;
  const status=old?.admin_hidden?'hidden':'published',reason=old?.admin_hidden?'admin_hidden':duplicate?'near_duplicate':old?.forced_noindex?'admin_noindex':'eligible';
  const id=old?.public_id||randomUUID();
  if(old && old.content_hash===safe.hash && old.status===status && !!old.indexable===indexable && old.eligibility_reason===reason && Object.entries(seo).every(([key,value])=>old[key]===value) && isDeepStrictEqual(parseJson(old.snapshot),data))return old;
  await db.execute(`INSERT INTO public_itineraries(public_id,source_trip_id,seed_key,city_key,city,country,duration_days,persona,intent,slug,title,description,h1,introduction,snapshot,content_hash,quality_score,status,indexable,eligibility_reason,duplicate_of,published_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE slug=VALUES(slug),city_key=VALUES(city_key),city=VALUES(city),country=VALUES(country),duration_days=VALUES(duration_days),persona=VALUES(persona),intent=VALUES(intent),title=VALUES(title),description=VALUES(description),h1=VALUES(h1),introduction=VALUES(introduction),snapshot=VALUES(snapshot),content_hash=VALUES(content_hash),quality_score=VALUES(quality_score),status=VALUES(status),indexable=VALUES(indexable),eligibility_reason=VALUES(eligibility_reason),duplicate_of=VALUES(duplicate_of),updated_at=CURRENT_TIMESTAMP(3),published_at=CURRENT_TIMESTAMP(3)`,
    [id,tripId,seedKey,data.city_key,data.city,data.country,data.duration_days,data.persona,data.intent,slug,seo.title,seo.description,seo.h1,seo.introduction,JSON.stringify(data),safe.hash,safe.quality,status,indexable,reason,duplicate?.public_id||null]);
  const [[saved]]=await db.execute('SELECT * FROM public_itineraries WHERE public_id=?',[id]);return saved;
}
async function blocked(db, tripId, code) {
  // Failed source content is never stored in the public table, even for admin review.
  const id=randomUUID();
  await db.execute(`INSERT INTO public_itineraries(public_id,source_trip_id,city_key,city,country,duration_days,persona,intent,slug,title,description,h1,introduction,snapshot,content_hash,quality_score,status,indexable,eligibility_reason)
    VALUES(?,?,'pending','','',0,'','',?,'','','','','{}','',0,'draft',FALSE,?)
    ON DUPLICATE KEY UPDATE status=IF(admin_hidden,'hidden','draft'),indexable=FALSE,eligibility_reason=VALUES(eligibility_reason),updated_at=CURRENT_TIMESTAMP(3)`,[id,tripId,id,code]);
}
export async function refreshTrip(tripId) {
  return transaction(async db=>{
    // Acquire before any consistent read: concurrent workers must see earlier publications
    // under MySQL REPEATABLE READ when deciding which similar route is indexable.
    await db.query('SELECT id FROM public_itinerary_publication_lock WHERE id=1 FOR UPDATE');
    const [[trip]]=await db.execute('SELECT id,owner_id FROM trips WHERE id=? FOR UPDATE',[tripId]);
    if(!trip)return null;
    await db.execute('SELECT trip_id FROM public_itinerary_jobs WHERE trip_id=? FOR UPDATE',[tripId]);
    const {snapshot,inputHash}=await import('../itinerary-service.js');
    const {healthSummary}=await import('../trip-health.js');
    const {SCHEDULER_VERSION}=await import('../itinerary-engine.js');
    const state=await snapshot(db,tripId,trip.owner_id);
    const [[user]]=await db.execute('SELECT role,status,email,email_verified,public_itinerary_eligible FROM users WHERE id=?',[trip.owner_id]);
    try {
      let meta;try{meta=parseJson(state.trip.itinerary_meta||'{}');}catch{throw new PublicationBlocked('invalid_private_metadata');}
      const ready=healthSummary(state,{stale:!meta.input_hash||meta.input_hash!==inputHash(state),requiresRegeneration:(meta.scheduler_version||0)<SCHEDULER_VERSION,conflicts:meta.conflicts||[],unscheduledOptional:[]}).status==='READY';
      const safe=sanitizeItinerary({...state,user},{ready});
      // An earlier failed placeholder must not reserve a public destination URL.
      await db.execute("DELETE FROM public_itineraries WHERE source_trip_id=? AND city_key='pending' AND admin_hidden=FALSE",[tripId]);
      const result=await publishSnapshot(db,safe,{tripId});
      await db.execute('DELETE FROM public_itinerary_jobs WHERE trip_id=?',[tripId]);return result;
    } catch(error) {
      if(!(error instanceof PublicationBlocked))throw error;
      await blocked(db,tripId,error.code);
      await db.execute('DELETE FROM public_itinerary_jobs WHERE trip_id=?',[tripId]);return {status:'draft',eligibility_reason:error.code};
    }
  });
}
let draining=false;
export async function drainPublicItineraryJobs(limit=20) {
  if(draining)return 0;draining=true;
  try {
    const [jobs]=await pool.query('SELECT trip_id FROM public_itinerary_jobs WHERE attempts<5 ORDER BY updated_at LIMIT '+Math.min(100,Math.max(1,Number(limit)||20)));
    for(const job of jobs)try{await refreshTrip(job.trip_id);}catch{
      // Fixed operational code only: no raw SQL errors, user text or provider payloads.
      await pool.execute("UPDATE public_itinerary_jobs SET attempts=attempts+1,reason='refresh_failed',updated_at=CURRENT_TIMESTAMP(3) WHERE trip_id=?",[job.trip_id]);
    }
    return jobs.length;
  } finally {draining=false;}
}
export async function seedPublicItineraries() {
  const rows=[];
  for(const destination of DESTINATIONS)rows.push(await transaction(db=>publishSnapshot(db,sanitizeItinerary(seedState(destination),{seed:true}),{seedKey:`editorial-v1-${destination.key}`})));
  return rows;
}
export function catalogQuery(query) {
  const allowed=new Set(['city','country','duration','persona','intent','page','limit','sort']);
  for(const [key,value]of Object.entries(query))assert(allowed.has(key)&&typeof value==='string'&&value.length<=100,400,'Invalid catalog filter.');
  const page=Number(query.page||1),limit=Number(query.limit||9);
  assert(Number.isInteger(page)&&page>=1&&page<=1000&&Number.isInteger(limit)&&limit>=1&&limit<=24,400,'Invalid pagination.');
  assert(!query.sort||['recent','duration','city'].includes(query.sort),400,'Invalid sort.');
  const where=[visibleWhere,'p.indexable=TRUE'],values=[];
  for(const [key,column]of Object.entries({city:'city_key',country:'country',persona:'persona',intent:'intent'}))if(query[key]){where.push(`p.${column}=?`);values.push(key==='city'?slugify(query[key]):query[key]);}
  if(query.duration){const duration=Number(query.duration);assert(Number.isInteger(duration)&&duration>=1&&duration<=14,400,'Invalid duration.');where.push('p.duration_days=?');values.push(duration);}
  const order={recent:'p.updated_at DESC,p.public_id',duration:'p.duration_days,p.city,p.public_id',city:'p.city,p.public_id'}[query.sort||'city'];
  return {where:where.join(' AND '),values,order,page,limit,offset:(page-1)*limit};
}
export async function publicCatalog(query,db=pool) {
  const q=catalogQuery(query);
  const [[{total}]]=await db.execute(`SELECT COUNT(*) AS total FROM public_itineraries p ${sourceJoins} WHERE ${q.where}`,q.values);
  const [rows]=await db.execute(`SELECT p.* FROM public_itineraries p ${sourceJoins} WHERE ${q.where} ORDER BY ${q.order} LIMIT ${q.limit} OFFSET ${q.offset}`,q.values);
  // Bound each distinct facet separately: a popular city's many combinations
  // must not push every other city out of a combined-row facet limit.
  const facet=async(columns,order,limit)=>{
    const [result]=await db.query(`SELECT DISTINCT ${columns} FROM public_itineraries p ${sourceJoins} WHERE ${visibleWhere} AND p.indexable=TRUE ORDER BY ${order} LIMIT ${limit}`);return result;
  };
  const [cities,countries,durations,personas,intents]=await Promise.all([
    facet('p.city_key,p.city','p.city',1000),facet('p.country','p.country',250),facet('p.duration_days','p.duration_days',14),facet('p.persona','p.persona',20),facet('p.intent','p.intent',20),
  ]);
  return {items:rows.map(publicCard),page:q.page,limit:q.limit,total,has_more:q.offset+rows.length<total,facets:{cities:cities.map(r=>({value:r.city_key,label:r.city})),countries:countries.map(r=>r.country),durations:durations.map(r=>r.duration_days),personas:personas.map(r=>r.persona),intents:intents.map(r=>r.intent)}};
}
