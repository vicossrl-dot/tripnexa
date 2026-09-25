export const CUISINES = ['Local / Traditional','Italian','Greek','French','Middle Eastern / Lebanese','Asian','Japanese / Sushi','Seafood','Steakhouse / Grill','Vegetarian / Vegan','Fast Food / Street Food'];
export const DINING_BUDGETS = {any:'Any',budget:'Budget-friendly',moderate:'Moderate',premium:'Premium'};
export function foodPreferences(value) {
  try { const list=JSON.parse(value||'[]');return Array.isArray(list)?list.filter(item=>CUISINES.includes(item)):[]; } catch {return [];}
}
export function mealChoice(item) {try{return JSON.parse(item.meal_choice||'null');}catch{return null;}}
export function appendPlaceRequest(current, places) {
  const additions=places.map(place=>`Please include ${place.name} in the itinerary. If necessary, replace a lower-priority optional activity, but keep must-see places and confirmed bookings unchanged.`).filter(line=>!current.includes(line));
  return [current.trimEnd(),...additions].filter(Boolean).join('\n\n');
}
