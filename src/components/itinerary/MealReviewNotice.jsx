import { t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
export default function MealReviewNotice({choices=[]}) {
  useLocale();
 if(!choices.length)return null;
 return <details className="trip-card mb-5"><summary className="trip-disclosure">{t("ui.saved.restaurants.to.review.7d250de")}{choices.length})</summary><p className="trip-muted mt-2">{t("ui.these.meals.are.no.longer.in.the.updated.schedule.your.restaurant.964c769")}</p><ul className="mt-3 space-y-2">{choices.map(choice=><li key={choice.date+choice.place_id} className="text-sm">{choice.date} · {choice.name} <a className="trip-link ml-2" href={choice.maps_url} target="_blank" rel="noopener noreferrer">{t("ui.open.in.google.maps.7f22a63")}</a></li>)}</ul></details>;
}
