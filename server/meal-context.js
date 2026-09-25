import { mealChoice } from '../src/lib/dining.js';
export const coordinates=p=>p&&p.lat!=null&&p.lng!=null&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
export function kilometers(a,b){if(!coordinates(a)||!coordinates(b))return Infinity;const r=Math.PI/180,x=(b.lng-a.lng)*r*Math.cos((Number(a.lat)+Number(b.lat))/2*r),y=(b.lat-a.lat)*r;return Math.hypot(x,y)*6371;}
export function mealContext(state,meal){
 const day=state.items.filter(item=>item.date===meal.date).sort((a,b)=>a.start_time.localeCompare(b.start_time));
 const index=day.findIndex(item=>item===meal||item.id&&item.id===meal.id);
 const locate=item=>{if(!item)return null;const place=state.places.find(p=>p.id===item.selection_id);return coordinates(item)?{lat:Number(item.lat),lng:Number(item.lng),name:item.title}:coordinates(place)?{lat:Number(place.lat),lng:Number(place.lng),name:place.name}:null;};
 const before=locate(day.slice(0,index).reverse().find(item=>item.step_type==='visit'));
 const after=locate(day.slice(index+1).find(item=>item.step_type==='visit'));
 const stay=state.tripItems.filter(item=>item.category==='stay'&&(!item.date||item.date<=meal.date)&&(!item.end_date||item.end_date>=meal.date)&&coordinates(item)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0];
 const fallback=stay?{lat:Number(stay.lat),lng:Number(stay.lng),name:stay.title}:coordinates({lat:state.trip.destination_latitude,lng:state.trip.destination_longitude})?{lat:state.trip.destination_latitude,lng:state.trip.destination_longitude,name:state.trip.destination}:null;
 // A return to the stay before lunch changes where the traveler actually is.
 const atMeal=meal.location&&[...state.places,...state.tripItems].find(place=>coordinates(place)&&[place.address,place.name,place.title].includes(meal.location));
 const current=atMeal?{lat:Number(atMeal.lat),lng:Number(atMeal.lng),name:atMeal.name||atMeal.title}:null;
 const anchor=current||before||after||fallback;
 return {anchor,previous:current||before||null,next:after||null,source:current?'meal location':before?'previous activity':after?'next activity':stay?'stay':'destination'};
}
export function preserveMealChoices(state,items){
 for(const date of new Set(items.map(item=>item.date))){
  const old=state.items.filter(item=>item.date===date&&item.step_type==='meal').sort((a,b)=>a.start_time.localeCompare(b.start_time));
  const next=items.filter(item=>item.date===date&&item.step_type==='meal').sort((a,b)=>a.start_time.localeCompare(b.start_time));
  next.forEach((meal,index)=>{const chosen=mealChoice(old[index]||{});if(!chosen)return;
   const context=mealContext({...state,items},meal),changed=kilometers(chosen.anchor,context.anchor)>0.8;
   meal.meal_choice=JSON.stringify({...chosen,needs_review:chosen.needs_review||changed||meal.start_time!==old[index].start_time||state.trip.food_preferences!==chosen.food_preferences||state.trip.dining_budget!==chosen.dining_budget||state.trip.dietary_notes!==chosen.dietary_notes});
  });
 }
 return items;
}
