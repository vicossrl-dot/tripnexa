import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { CUISINES,DINING_BUDGETS,foodPreferences } from '@/lib/dining';
export default function FoodPreferences({trip,update}) {
  useLocale();
 const selected=foodPreferences(trip.food_preferences);
 return <section className="space-y-3" data-food-preferences><h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">{t("ui.food.dining.07946da")}</h3>
  <p className="text-sm text-white/60">{t("ui.tell.tripnexa.what.kind.of.food.you.prefer.we.ll.use.this.when.su.0e57a61")}</p>
  <p className="text-sm text-white/80">{t("ui.cuisine.preferences.9000d8f")}</p><div className="flex flex-wrap gap-2">{["Any cuisine",...CUISINES].map(cuisine=>{const active=cuisine==='Any cuisine'?!selected.length:selected.includes(cuisine);return <button key={cuisine} type="button" aria-pressed={active} className={`rounded-full px-3 py-1.5 text-sm ${active?'bg-lime text-neutral-900':'border border-white/15 text-white/70'}`} onClick={()=>update('food_preferences',JSON.stringify(cuisine==='Any cuisine'?[]:active?selected.filter(c=>c!==cuisine):[...selected,cuisine]))}>{translateText(cuisine)}</button>;})}</div>
  <label className="block text-sm text-white/80" htmlFor="dining-budget">{t("ui.dining.budget.8f4a36f")}</label><select id="dining-budget" className="w-full rounded-xl border border-white/20 bg-neutral-900 p-3" value={trip.dining_budget||'any'} onChange={event=>update('dining_budget',event.target.value)}>{Object.entries(DINING_BUDGETS).map(([key,label])=><option key={key} value={key}>{translateText(label)}</option>)}</select>
  <label className="block text-sm text-white/80" htmlFor="dietary-needs">{t("ui.dietary.needs.65d7cf0")}</label><textarea id="dietary-needs" rows={2} maxLength={1000} value={trip.dietary_notes||''} placeholder={t("ui.vegetarian.gluten.free.halal.allergies.287d14b")} onChange={event=>update('dietary_notes',event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/5 p-3"/>
 </section>;
}
