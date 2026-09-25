import {config} from './config.js';
import {google} from './places.js';
import {runtimeSettings} from './admin/runtime.js';
import {scheduleItinerary} from './itinerary-engine.js';
import {routeKey,coordinates} from './route-data.js';

export async function routeEstimate(from,to,mode,fetchImpl=fetch){
 if(!config.googleMapsKey||!coordinates(from)||!coordinates(to))return null;
 const travelMode={walk:'WALK',transit:'TRANSIT',car:'DRIVE',taxi:'DRIVE'}[mode];if(!travelMode)return null;
 try{
  const point=p=>({location:{latLng:{latitude:Number(p.lat),longitude:Number(p.lng)}}});
  const data=await google('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':config.googleMapsKey,'X-Goog-FieldMask':'routes.duration,routes.distanceMeters'},body:JSON.stringify({origin:point(from),destination:point(to),travelMode})},fetchImpl);
  const value=data.routes?.[0]?.duration;if(typeof value!=='string'||!/^\d+(\.\d+)?s$/.test(value))return null;
  const minutes=Math.ceil(parseFloat(value)/60);return minutes>0&&minutes<=1440?{minutes,mode,source:'google'}:null;
 }catch{return null;}
}
export async function prepareScheduling(state,fetchImpl=fetch){
 const facts=new Map(),settings=runtimeSettings()?.settings;
 if(config.googleMapsKey&&settings?.google_enabled!==false){
  const ids=[...new Set([...state.places,...state.tripItems].filter(p=>p.priority!=='excluded').map(p=>p.place_id).filter(id=>/^[a-zA-Z0-9_-]{1,255}$/.test(id||'')))].slice(0,40);
  for(let i=0;i<ids.length;i+=4)await Promise.all(ids.slice(i,i+4).map(async id=>{
   try{const data=await google('https://places.googleapis.com/v1/places/'+id,{headers:{'X-Goog-Api-Key':config.googleMapsKey,'X-Goog-FieldMask':'businessStatus,regularOpeningHours,location'}},fetchImpl);facts.set(id,data);}catch{/* Unknown is not closed. */}
  }));
 }
 const enrich=place=>({...place,__hours:facts.get(place.place_id),...(facts.get(place.place_id)?.location?{lat:facts.get(place.place_id).location.latitude,lng:facts.get(place.place_id).location.longitude}:{})});
 return {...state,places:state.places.map(enrich),tripItems:state.tripItems.map(enrich),trip:{...state.trip,__routes:new Map(),__routeRequests:new Map()}};
}
export async function scheduleWithProviders(state,proposal=[],onlyDates=null,options={},fetchImpl=fetch){
 const prepared=options.prepared||await prepareScheduling(state,fetchImpl),trip=prepared.trip;
 let result=scheduleItinerary(prepared,proposal,onlyDates,options);
 trip.__routeCalls??=0;
 const enabled=runtimeSettings()?.settings.google_routes_enabled??process.env.GOOGLE_ROUTES_ENABLED==='true';
 if(enabled&&config.googleMapsKey){
  // Re-run the same scheduler with measured durations; never patch times after scheduling.
  for(let round=0;round<3&&trip.__routeCalls<40;round++){
   const requests=[...trip.__routeRequests.values()].filter(r=>!trip.__routes.has(routeKey(r.from,r.to,r.mode))).slice(0,40-trip.__routeCalls);
   if(!requests.length)break;
   for(let i=0;i<requests.length;i+=4)await Promise.all(requests.slice(i,i+4).map(async r=>{trip.__routeCalls++;trip.__routes.set(routeKey(r.from,r.to,r.mode),await routeEstimate(r.from,r.to,r.mode,fetchImpl));}));
   result=scheduleItinerary(prepared,proposal,onlyDates,options);
  }
 }
 return result;
}
