import {mealChoice} from '@/lib/dining';
export default function MealDetails({item,onOptions}){
 const choice=mealChoice(item);
 return <div className="mt-3 space-y-2" data-meal-details>{choice&&<><p className="font-medium">{choice.name}</p><p className="trip-muted">{choice.category}{choice.rating!=null&&` · ${choice.rating} ★`}</p><p className="trip-muted">{choice.address}</p>{choice.needs_review&&<p className="text-sm text-amber-200">Your route, time or preferences changed. Check this restaurant still fits this meal.</p>}<a className="trip-link text-sm inline-block mr-4" href={choice.maps_url} target="_blank" rel="noopener noreferrer">Open in Google Maps</a></>}
  <button className="trip-link text-sm" onClick={()=>onOptions(item)}>{choice?'Change restaurant':'View meal options'}</button>
 </div>;
}
