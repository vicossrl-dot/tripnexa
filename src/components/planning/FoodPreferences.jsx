import { CUISINES,DINING_BUDGETS,foodPreferences } from '@/lib/dining';
export default function FoodPreferences({trip,update}) {
 const selected=foodPreferences(trip.food_preferences);
 return <section className="space-y-3" data-food-preferences><h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Food & Dining</h3>
  <p className="text-sm text-white/60">Tell TripSync what kind of food you prefer. We’ll use this when suggesting meal options along your route.</p>
  <p className="text-sm text-white/80">Cuisine preferences</p><div className="flex flex-wrap gap-2">{['Any cuisine',...CUISINES].map(cuisine=>{const active=cuisine==='Any cuisine'?!selected.length:selected.includes(cuisine);return <button key={cuisine} type="button" aria-pressed={active} className={`rounded-full px-3 py-1.5 text-sm ${active?'bg-lime text-neutral-900':'border border-white/15 text-white/70'}`} onClick={()=>update('food_preferences',JSON.stringify(cuisine==='Any cuisine'?[]:active?selected.filter(c=>c!==cuisine):[...selected,cuisine]))}>{cuisine}</button>;})}</div>
  <label className="block text-sm text-white/80" htmlFor="dining-budget">Dining budget</label><select id="dining-budget" className="w-full rounded-xl border border-white/20 bg-neutral-900 p-3" value={trip.dining_budget||'any'} onChange={event=>update('dining_budget',event.target.value)}>{Object.entries(DINING_BUDGETS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
  <label className="block text-sm text-white/80" htmlFor="dietary-needs">Dietary needs</label><textarea id="dietary-needs" rows={2} maxLength={1000} value={trip.dietary_notes||''} placeholder="Vegetarian, gluten-free, halal, allergies…" onChange={event=>update('dietary_notes',event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/5 p-3"/>
 </section>;
}
