import { t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { Link } from 'react-router-dom';

export default function OptionalPlaces({ places = [], tripId }) {
  useLocale();
  if (!places.length) return null;
  return <details className="trip-card mb-5" data-optional-places>
    <summary className="trip-disclosure">{places.length}{" "}{t("ui.optional.ec91fdd")}{" "}{places.length === 1 ? t("ui.idea.ae0a9ad") : t("ui.ideas.53d8ba9")}{" "}{t("ui.saved.for.later.4ddea88")}</summary>
    <p className="trip-muted mt-3">{t("ui.your.plan.includes.the.options.that.fit.your.available.time.and.p.f7ab6ea")}</p>
    <ul className="list-disc pl-5 mt-3 space-y-1 text-sm">{places.map(place => <li key={place.selection_id}>{place.name}</li>)}</ul>
    <p className="trip-muted mt-3">{t("ui.use.change.itinerary.to.add.or.swap.an.idea.or.set.its.priority.t.f0945e1")}</p>
    <Link className="trip-link inline-block mt-3" to={`/trip/${tripId}/plan?step=3`}>{t("ui.review.options.fb221d8")}</Link>
  </details>;
}
