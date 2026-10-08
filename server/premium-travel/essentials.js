import {createHash,randomUUID} from 'node:crypto';
import {pool} from '../db.js';
import {assert} from '../errors.js';
import {countryCode} from '../../src/lib/country-codes.js';
import {retrieveEssentials,practicalCountry,noticeApplies} from './essentials-provider.js';
import {validFact,essentialsDiagnostic} from './essentials-policy.js';
import {validTimezone,savedOrigin,timezoneFacts} from './essentials-time.js';
import {sectionLimit,essentialsGuideVersion,generatedRequiredKeys} from '../../src/lib/essentials-guidance.js';
import {evaluateCompleteness,generatedSectionReady} from './essentials-generation.js';
import {essentialsAccounting,ESSENTIALS_WINDOW_MS} from './essentials-limits.js';

export function essentialsContext(state,passport){
 const passportCode=passport?countryCode(passport):null;assert(!passport||passportCode&&passport===passportCode,400,'Choose a passport country code.');
 const countries=new Set([countryCode(state.trip.country)]);
 for(const stay of state.tripItems.filter(item=>item.category==='stay'&&(!item.date||item.date<=state.trip.end_date)&&(!item.end_date||item.end_date>=state.trip.start_date)))countries.add(countryCode(stay.country));
 for(const item of state.items){const selected=state.places.find(place=>place.id===item.selection_id);if(selected)countries.add(countryCode(selected.country));try{const restaurant=JSON.parse(item.meal_choice||'null');if(restaurant)countries.add(countryCode(restaurant.country));}catch{}}
 const text=value=>typeof value==='string'?value.slice(0,100):null,city=state.trip.destination_city||state.trip.destination;
 const visits=state.items.filter(item=>item.step_type==='visit').map(item=>{const place=state.places.find(place=>place.id===item.selection_id);return place?.name?{date:item.date,name:text(place.name),city:text(place.city),country:countryCode(place.country)}:null;}).filter(Boolean).slice(0,40);
 return {countries:[...countries].filter(Boolean).sort(),travelerPassportCountry:passportCode,startDate:state.trip.start_date||null,endDate:state.trip.end_date||null,
  guideVersion:essentialsGuideVersion,primaryCountry:countryCode(state.trip.country),cities:[...new Set([city,...visits.map(visit=>visit.city)].filter(Boolean).map(text))].slice(0,10),...savedOrigin(state),
  currency:/^[A-Z]{3}$/.test(state.trip.currency||'')?state.trip.currency:null,timezone:validTimezone(state.trip.timezone),
  transportModes:[...new Set(state.items.map(item=>item.route_mode).filter(value=>['walk','transit','car','taxi'].includes(value)))].sort(),
  tripDurationDays:Math.max(0,(Date.parse(state.trip.end_date)-Date.parse(state.trip.start_date))/86400000+1)||null,
  stays:state.tripItems.filter(item=>item.category==='stay').slice(0,12).map(item=>({country:countryCode(item.country),city:text(item.city),startDate:item.date||null,endDate:item.end_date||null})),
  itinerary:{visits,transportDays:[...new Set(state.items.filter(item=>['transport','transfer'].includes(item.step_type)).map(item=>item.date))].sort().slice(0,40).map(date=>({date,modes:[...new Set(state.items.filter(item=>item.date===date).map(item=>item.route_mode).filter(value=>['walk','transit','car','taxi'].includes(value)))]})),arrivalCity:text(state.trip.arrival_city),arrivalMode:['flight','train','car','ship','bus'].includes(state.trip.arrival_mode)?state.trip.arrival_mode:null}};
}
export const essentialsHash=context=>createHash('sha256').update(JSON.stringify(context)).digest('hex');
const legacyContext=context=>({countries:context.countries,travelerPassportCountry:context.travelerPassportCountry,startDate:context.startDate,endDate:context.endDate});
const previousContext=(context,trip)=>({...legacyContext(context),guideVersion:2,cities:[trip.destination_city||trip.destination].filter(value=>typeof value==='string').map(value=>value.slice(0,100)),originCountry:countryCode(trip.origin_country)||null,currency:context.currency,timezone:trip.timezone||null,transportModes:context.transportModes});
// Reconstruct historical hash inputs exactly, including the old origin priority.
function historicalOriginTimezone(state){
 const explicit=validTimezone(state.trip.origin_timezone);if(explicit)return explicit;
 const destination=validTimezone(state.trip.timezone),arrival=state.trip.arrival_datetime?.slice(0,10)||state.trip.start_date;
 const zones=[...new Set(state.tripItems.filter(item=>item.category==='flight'&&item.arrival_datetime?.slice(0,10)===arrival&&validTimezone(item.arrival_timezone)===destination).map(item=>validTimezone(item.departure_timezone)).filter(Boolean))];
 return zones.length===1&&zones[0]!==destination?zones[0]:zones.length?null:({MD:'Europe/Chisinau',RO:'Europe/Bucharest'}[countryCode(state.trip.origin_country)]||null);
}
const refinementContext=(context,state,version)=>({...legacyContext(context),guideVersion:version,primaryCountry:context.primaryCountry,cities:context.cities,originCountry:countryCode(state.trip.origin_country)||null,originTimezone:historicalOriginTimezone(state),currency:context.currency,timezone:context.timezone,transportModes:context.transportModes,itinerary:context.itinerary});
const timestamp=value=>new Date(typeof value==='string'&&!/(Z|[+-]\d{2}:\d{2})$/.test(value)?value.replace(' ','T')+'Z':value).getTime();
const pending=new Map(),attempts=new Map();
function savedValues(data){
 const country=data.countries.find(country=>country.code===data.primaryCountry)||(data.countries.length===1?data.countries[0]:null);if(!country)return data;
 if(data.currency){const section=country.sections.find(section=>section.key==='money');let detail=data.currency;try{const name=new Intl.DisplayNames(['en'],{type:'currency'}).of(data.currency),symbol=new Intl.NumberFormat('en-US',{style:'currency',currency:data.currency,currencyDisplay:'narrowSymbol'}).formatToParts(0).find(part=>part.type==='currency').value;detail+=` (${name}, ${symbol})`;}catch{}
  section.facts=[{text:'Saved trip currency: '+detail,sourceType:'saved_trip',sourceUrl:null,verifiedAt:null,checkedAt:null},...section.facts.filter(fact=>fact.sourceType!=='saved_trip')].slice(0,sectionLimit('money')+1);
 }
 // The model cannot override timezone maths or infer a home country from nationality.
 country.sections.find(section=>section.key==='timezone').facts=timezoneFacts(data);return data;
}
export function emptyEssentials(context){return evaluateCompleteness(savedValues({...context,version:essentialsGuideVersion,generatedAt:null,guidanceStatus:'practical',status:'ready',countries:context.countries.map(code=>practicalCountry(code,context.travelerPassportCountry))}));}
export function mergeCountry(previous,country,result,now){
 for(const section of country.sections){
  const incoming=result?.sections?.find(value=>value.key===section.key),old=previous?.sections?.find(value=>value.key===section.key);
  const legacyRules=section.key==='customs'?result?.sections?.find(value=>value.key==='rules')?.facts||[]:[];
  const fresh=[...(incoming?.facts||section.facts),...legacyRules].map(fact=>validFact(fact,section.key,country.code)).filter(Boolean);
  const retained=[...(old?.facts||[]),...(section.key==='customs'?previous?.sections?.find(value=>value.key==='rules')?.facts||[]:[])].map(fact=>validFact(fact,section.key,country.code,{legacyCheckedAt:previous?.checkedAt})).filter(Boolean);
  const verified=fresh.filter(fact=>fact.verifiedAt),savedVerified=retained.filter(fact=>fact.verifiedAt&&now-timestamp(fact.verifiedAt)<86400000&&timestamp(fact.verifiedAt)<=now);
  const unique=facts=>facts.filter((fact,index,all)=>all.findIndex(value=>fact.field?value.field===fact.field:value.text===fact.text)===index);
  if(generatedRequiredKeys.includes(section.key)){
   const ordinary=unique([...fresh,...retained].filter(fact=>['ai_general','trusted'].includes(fact.sourceType))).slice(0,sectionLimit(section.key));
   // Legal evidence supplements etiquette instead of replacing its required facts.
   section.facts=[...ordinary,...unique([...verified,...savedVerified]).slice(0,sectionLimit(section.key))];
   section.generation=generatedSectionReady(section)?{status:'ready',reason:null}:incoming?.generation||old?.generation||{status:'missing',reason:'missing_fields'};
  }else {
   section.facts=(verified.length?verified:savedVerified.length?savedVerified:fresh.length?fresh:retained).slice(0,sectionLimit(section.key));
   if(incoming?.generation||old?.generation)section.generation=incoming?.generation||old.generation;
  }
 }
 const dates=country.sections.flatMap(section=>section.facts).map(fact=>fact.verifiedAt).filter(Boolean).sort();country.checkedAt=dates[0]||null;country.status='ready';country.sources=[...new Set([...country.sources,...country.sections.flatMap(section=>section.facts).filter(fact=>fact.verifiedAt).map(fact=>fact.sourceUrl)])];return country;
}
async function findRow(state,context,db){
 const hash=essentialsHash(context),v4=essentialsHash(refinementContext(context,state,4)),v3=essentialsHash(refinementContext(context,state,3)),priorHash=essentialsHash(previousContext(context,state.trip)),oldHash=essentialsHash(legacyContext(context));
 const [[row]]=await db.execute('SELECT snapshot,checked_at,context_hash FROM trip_essentials_snapshots WHERE trip_id=? AND owner_id=? AND context_hash IN (?,?,?,?,?) ORDER BY (context_hash=?) DESC,(context_hash=?) DESC,(context_hash=?) DESC,(context_hash=?) DESC LIMIT 1',[state.trip.id,state.ownerId,hash,v4,v3,priorHash,oldHash,hash,v4,v3,priorHash]);return row||null;
}
function normalize(data,context,checkedAt=null){
 const base=emptyEssentials(context);
 base.version=data?.version||essentialsGuideVersion;base.generatedAt=data?.generatedAt||null;base.generationId=data?.generationId||null;base.guidanceStatus=data?.guidanceStatus||'saved';base.verification=data?.verification||{status:'unavailable'};base.generation=data?.generation||{};
 for(const country of base.countries){const saved=data?.countries?.find(value=>value.code===country.code);mergeCountry(null,country,saved,Date.now());}
 for(const country of base.countries)country.sections.find(section=>section.key==='notice').facts=country.sections.find(section=>section.key==='notice').facts.filter(fact=>noticeApplies(fact,context,country.code));
 // A cleared passport never inherits entry claims from any old context.
 if(!context.travelerPassportCountry)for(const country of base.countries)country.sections.find(section=>section.key==='entryDocuments').facts=practicalCountry(country.code,null).sections[0].facts;
 if(base.verification.status==='pending')base.verification={...base.verification,status:'unavailable'};
 return {...evaluateCompleteness(savedValues(base),{current:data?.version===essentialsGuideVersion&&data?.guideVersion===essentialsGuideVersion}),stale:!!checkedAt&&Date.now()-timestamp(checkedAt)>86400000};
}
export async function savedEssentials(state,passport,db=pool){const context=essentialsContext(state,passport),row=await findRow(state,context,db);return row?normalize(typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot,context,row.checked_at):{...emptyEssentials(context),verification:{status:'unavailable'},stale:false};}
// UI-only quota metadata. PDF readers keep their existing saved-snapshot path.
export async function essentialsWithUpdates(state,passport,data,{db=pool,accounting=essentialsAccounting}={}){
 const updates=data.updates||await accounting.read(state.ownerId,state.trip.id);let result=data;
 if(updates.blocked&&!data.generatedAt){
  const [[row]]=await db.execute("SELECT snapshot,checked_at FROM trip_essentials_snapshots WHERE trip_id=? AND owner_id=? AND JSON_EXTRACT(snapshot,'$.generatedAt') IS NOT NULL AND JSON_TYPE(JSON_EXTRACT(snapshot,'$.generatedAt')) <> 'NULL' ORDER BY checked_at DESC LIMIT 1",[state.trip.id,state.ownerId]);
  if(row){const prior=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot,context=essentialsContext(state,passport);result=normalize(prior,context,row.checked_at);
   // Retain ordinary saved guidance, never transplant entry claims to a new context.
   for(const country of result.countries)country.sections.find(section=>section.key==='entryDocuments').facts=practicalCountry(country.code,passport).sections.find(section=>section.key==='entryDocuments').facts;
   result.generation={...result.generation,current:false};result.cachedForDifferentContext=true;result.cachedPassportCountry=prior.travelerPassportCountry||null;
  }
 }
 return {...result,...(data.code?{code:data.code,nextAllowedAt:data.nextAllowedAt}:{}),updates};
}
async function persist(state,context,data,db,now,row){
 const hash=essentialsHash(context);let result;
 if(row?.context_hash===hash){const previous=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot;
  [result]=await db.execute("UPDATE trip_essentials_snapshots SET snapshot=?,checked_at=? WHERE trip_id=? AND owner_id=? AND context_hash=? AND JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.generationId')) <=> ?",[JSON.stringify(data),new Date(now),state.trip.id,state.ownerId,hash,previous.generationId||null]);
 }else [result]=await db.execute('INSERT IGNORE INTO trip_essentials_snapshots(trip_id,owner_id,context_hash,passport_country,snapshot,checked_at) VALUES(?,?,?,?,?,?)',[state.trip.id,state.ownerId,hash,context.travelerPassportCountry,JSON.stringify(data),new Date(now)]);
 return result.affectedRows===1;
}
export async function refreshEssentials(state,passport,{db=pool,retrieve=retrieveEssentials,now=Date.now(),log=console.info,accounting=essentialsAccounting}={}){
 const context=essentialsContext(state,passport),hash=essentialsHash(context),key=`${state.ownerId}:${state.trip.id}:${hash}`;
 if(pending.has(key))return pending.get(key);
 const work=(async()=>{
  const row=await findRow(state,context,db),previous=row?(typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot):null;
  const saved=previous?normalize(previous,context,row.checked_at):emptyEssentials(context),complete=saved.generation.status==='complete'&&saved.generation.current;
  const useful=saved.countries.some(country=>country.sections.some(section=>section.facts.some(fact=>['ai_general','trusted'].includes(fact.sourceType))));
  const recent=saved.generation.current&&useful&&saved.generatedAt&&now-timestamp(saved.generatedAt)<ESSENTIALS_WINDOW_MS,attempt=attempts.get(key);
  if(recent)return {...saved,updateSkipped:true};
  if(Date.parse(saved.generation.retryAfter)>now||attempt&&now-attempt.at<attempt.cooldown)return {...saved,retryBlocked:true,updateIncomplete:!complete,updateFailed:complete&&!!saved.generation.lastAttemptFailed};
  attempts.set(key,{at:now,cooldown:60000});while(attempts.size>256)attempts.delete(attempts.keys().next().value);
  let guide;
  try{guide=await retrieve(context,{beforeRequest:signal=>accounting.reserve(state.ownerId,state.trip.id,signal)});}catch{
   for(const code of context.countries)essentialsDiagnostic(code,'guide-failed',log);
   guide={countries:context.countries.map(code=>({...practicalCountry(code,passport),sections:practicalCountry(code,passport).sections.map(section=>({...section,...(generatedRequiredKeys.includes(section.key)?{generation:{status:'failed',reason:'provider_or_schema_failure'}}:{})}))})),guidanceStatus:'failed',generationCalls:0};
  }
  if(guide.dailyLimit){attempts.delete(key);return {...saved,code:'ESSENTIALS_DAILY_LIMIT',nextAllowedAt:guide.dailyLimit.nextAllowedAt,updates:guide.dailyLimit};}
  const data=emptyEssentials(context);data.generatedAt=new Date(now).toISOString();data.generationId=randomUUID();data.guidanceStatus=guide.guidanceStatus||'ai_generated';
  for(const country of data.countries)mergeCountry(saved.countries.find(value=>value.code===country.code),country,guide.countries?.find(value=>value.code===country.code),now);
  evaluateCompleteness(savedValues(data));
  const failedUpdate=guide.guidanceStatus==='failed';
  if(failedUpdate)data.generatedAt=saved.generatedAt;
  data.generation={...data.generation,attemptedAt:new Date(now).toISOString(),retryAfter:data.generation.status==='complete'&&!failedUpdate?null:new Date(now+60000).toISOString(),lastAttemptFailed:failedUpdate,generationCalls:guide.generationCalls||0};
  attempts.set(key,{at:now,cooldown:60000});
  data.verification=guide.verification||{status:'unavailable'};
  if(!await persist(state,context,data,db,failedUpdate&&previous?timestamp(row.checked_at):now,row))return {...await savedEssentials(state,passport,db),updateConflict:true};
  return {...data,stale:false,updateIncomplete:data.generation.status!=='complete',updateFailed:failedUpdate};
 })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
