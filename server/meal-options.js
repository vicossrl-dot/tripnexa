import { randomUUID,createHash } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { google } from './places.js';
import { config } from './config.js';
import { assert } from './errors.js';
import { transaction } from './db.js';
import { snapshot,revision,readItinerary } from './itinerary-service.js';
import { coordinates,kilometers,mealContext } from './meal-context.js';
import { foodPreferences } from '../src/lib/dining.js';
import {runtimeSettings} from './admin/runtime.js';

const cache=new Map(),ttl=10*60000;
const types={'Italian':['italian','pizza'],'Greek':['greek'],'French':['french'],'Middle Eastern / Lebanese':['lebanese','middle_eastern'],'Asian':['asian','chinese','thai','korean','vietnamese'],'Japanese / Sushi':['japanese','sushi'],'Seafood':['seafood'],'Steakhouse / Grill':['steak','barbecue'],'Vegetarian / Vegan':['vegetarian','vegan'],'Fast Food / Street Food':['fast_food','hamburger','sandwich']};
const priceLabels={PRICE_LEVEL_FREE:'Free',PRICE_LEVEL_INEXPENSIVE:'Budget-friendly',PRICE_LEVEL_MODERATE:'Moderate',PRICE_LEVEL_EXPENSIVE:'Premium',PRICE_LEVEL_VERY_EXPENSIVE:'Premium'};
const priceFilters={budget:['PRICE_LEVEL_FREE','PRICE_LEVEL_INEXPENSIVE'],moderate:['PRICE_LEVEL_INEXPENSIVE','PRICE_LEVEL_MODERATE'],premium:['PRICE_LEVEL_EXPENSIVE','PRICE_LEVEL_VERY_EXPENSIVE']};
export const qualityScore=(rating,count)=>(Number(count)||0)/((Number(count)||0)+100)*(Number(rating)||0)+100/((Number(count)||0)+100)*4;
const safeMap=(uri,id,name)=>{try{const url=new URL(uri);if(url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='maps.google.com'||url.hostname==='www.google.com'||url.hostname==='maps.app.goo.gl'))return url.href;}catch{}return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(id)}`;};
export async function searchMeals(state,meal,fetchImpl=fetch){
 const context=mealContext(state,meal);assert(context.anchor,422,'Confirm a nearby activity or hotel location before searching for meal options.');
 const preferences=foodPreferences(state.trip.food_preferences),cuisines=preferences.length?preferences:['Any cuisine'];
 const groups=Array.from({length:Math.min(3,cuisines.length)},()=>[]);cuisines.forEach((c,i)=>groups[i%groups.length].push(c));
 const dietary=String(state.trip.dietary_notes||'').slice(0,1000);
 const preferencesConfig=runtimeSettings()?.settings,radius=state.trip.mobility_needs||state.trip.stroller?Math.min(1000,preferencesConfig?.restaurant_radius_m||1500):preferencesConfig?.restaurant_radius_m||1500;
 const mask='id,displayName,formattedAddress,location,primaryType,types,rating,userRatingCount,priceLevel,googleMapsUri,servesVegetarianFood,businessStatus';
 const batches=await Promise.all(groups.map(async group=>{
  const query=group.map(c=>c==='Local / Traditional'?'local traditional cuisine':c==='Any cuisine'?'':c).filter(Boolean).join(' or ');
  const response=await google('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':config.googleMapsKey,'X-Goog-FieldMask':mask.split(',').map(k=>'places.'+k).join(',')},body:JSON.stringify({textQuery:`${query} restaurants ${state.trip.destination||''} ${dietary}`.trim(),includedType:'restaurant',strictTypeFiltering:true,pageSize:20,languageCode:'en',locationBias:{circle:{center:{latitude:context.anchor.lat,longitude:context.anchor.lng},radius}},...(priceFilters[state.trip.dining_budget]?{priceLevels:priceFilters[state.trip.dining_budget]}:{})})},fetchImpl);
  return (response.places||[]).map(place=>({place,group}));
 }));
 const candidates=new Map();
 for(const {place:p,group} of batches.flat()){
  const point={lat:p.location?.latitude,lng:p.location?.longitude};if(!p.id||!p.displayName?.text||!coordinates(point)||p.businessStatus==='CLOSED_PERMANENTLY')continue;
  const distance=kilometers(context.anchor,point);if(distance>radius/1000)continue;
  if(/vegetarian|vegan/i.test(dietary)&&p.servesVegetarianFood===false)continue;
  const category=(p.primaryType||'restaurant').replaceAll('_',' '),matched=preferences.filter(c=>(types[c]||[]).some(type=>(p.types||[]).some(t=>t.includes(type))));
  const compatibility=matched.length?1:group.some(c=>preferences.includes(c))?0.5:0;
  const detour=context.previous&&context.next?Math.max(0,kilometers(context.previous,point)+kilometers(point,context.next)-kilometers(context.previous,context.next)):distance;
  const score=compatibility*2-distance*2-detour+qualityScore(p.rating,p.userRatingCount);
  const restaurant={place_id:p.id,name:p.displayName.text,address:p.formattedAddress||'',...point,category,rating:p.rating??null,review_count:p.userRatingCount??null,price_label:priceLabels[p.priceLevel]||null,maps_url:safeMap(p.googleMapsUri,p.id,p.displayName.text),distance_m:Math.round(distance*1000),description:`${category.charAt(0).toUpperCase()+category.slice(1)} · Google Maps`,vegetarian:p.servesVegetarianFood??null};
  if(!candidates.has(p.id)||candidates.get(p.id).score<score)candidates.set(p.id,{score,restaurant});
 }
 return {context,restaurants:[...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,preferencesConfig?.restaurant_results||5).map(p=>p.restaurant),notice:'Distances are approximate. Check opening hours for your meal time, accessibility and dietary requirements directly with the restaurant.'};
}
export async function lookupMeals(tripId,ownerId,mealId,refresh=false,fetchImpl=fetch){
 const state=await transaction(db=>snapshot(db,tripId,ownerId));const meal=state.items.find(item=>item.id===mealId&&item.step_type==='meal');assert(meal,404,'Meal not found.');
 const before=revision(state),key=createHash('sha256').update(JSON.stringify({ownerId,tripId,mealId,date:meal.date,start:meal.start_time,end:meal.end_time,context:mealContext(state,meal),preferences:[state.trip.food_preferences,state.trip.dining_budget,state.trip.dietary_notes,state.trip.mobility_needs,state.trip.stroller]})).digest('hex');
 for(const [k,v]of cache)if(v.expires<Date.now())cache.delete(k);
 if(!refresh&&cache.has(key)){cache.get(key).before=before;return cache.get(key).data;}
 const result=await searchMeals(state,meal,fetchImpl),token=randomUUID(),data={...result,token};
 if(cache.size>=200)cache.delete(cache.keys().next().value);
 cache.set(key,{ownerId,tripId,mealId,before,data,expires:Date.now()+(runtimeSettings()?.settings.restaurant_cache_minutes*60000||ttl)});return data;
}
export async function chooseMeal(tripId,ownerId,mealId,body){
 const entry=[...cache.values()].find(e=>e.data.token===body.token&&e.ownerId===ownerId&&e.tripId===tripId&&e.mealId===mealId&&e.expires>Date.now());assert(entry,409,'These meal options expired. Refresh options and choose again.');
 const restaurant=entry.data.restaurants.find(r=>r.place_id===body.place_id);assert(restaurant,400,'Choose a restaurant from these meal options.');
 await transaction(async db=>{
  const state=await snapshot(db,tripId,ownerId,true);assert(revision(state)===entry.before,409,'The itinerary or preferences changed. Refresh meal options before choosing.');
  const chosen={...restaurant,anchor:entry.data.context.anchor,selected_at:new Date().toISOString(),needs_review:false,food_preferences:state.trip.food_preferences,dining_budget:state.trip.dining_budget,dietary_notes:state.trip.dietary_notes};
  await db.execute('UPDATE itinerary_items SET meal_choice=? WHERE id=? AND trip_id=? AND owner_id=?',[JSON.stringify(chosen),mealId,tripId,ownerId]);
  await db.execute('UPDATE trips SET plan_version=COALESCE(plan_version,0)+1 WHERE id=? AND owner_id=?',[tripId,ownerId]);
 });return readItinerary(tripId,ownerId);
}
export const mealRouter=Router();
const mealLimit=rateLimit({windowMs:60000,limit:20,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false});
mealRouter.post('/:id/meals/:meal/options',mealLimit,async(req,res)=>res.json(await lookupMeals(req.params.id,req.user.id,req.params.meal,req.body?.refresh===true)));
mealRouter.post('/:id/meals/:meal/choice',mealLimit,async(req,res)=>res.json(await chooseMeal(req.params.id,req.user.id,req.params.meal,req.body||{})));
