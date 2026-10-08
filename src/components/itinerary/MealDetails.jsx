import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { Utensils } from 'lucide-react';
import {mealChoice} from '@/lib/dining';
export default function MealDetails({item,onOptions}){
  useLocale();
 const choice=mealChoice(item);
 return <div className="mt-3 space-y-2" data-meal-details>{choice&&<><p className="font-medium">{choice.name}</p><p className="trip-muted">{translateText(choice.category)}{choice.rating!=null&&` · ${choice.rating} ★`}</p><p className="trip-muted">{choice.address}</p>{choice.needs_review&&<p className="text-sm text-amber-200">{t("ui.your.route.time.or.preferences.changed.check.this.restaurant.stil.48231dd")}</p>}<a className="trip-link text-sm inline-block mr-4" href={choice.maps_url} target="_blank" rel="noopener noreferrer">{t("ui.open.in.google.maps.7f22a63")}</a></>}
  <button className="meal-options-button" onClick={()=>onOptions(item)}><Utensils size={15} aria-hidden="true"/>{choice?t("ui.change.restaurant.56cae5d"):t("ui.view.meal.options.2684e96")}</button>
 </div>;
}
