import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import MealReviewNotice from '@/components/itinerary/MealReviewNotice';
import MealOptionsDialog from '@/components/itinerary/MealOptionsDialog';
import MealDetails from '@/components/itinerary/MealDetails';
import OptionalPlaces from '@/components/itinerary/OptionalPlaces';
import { ItineraryIcon, ItineraryTime, itineraryIdentity } from '@/components/itinerary/ItineraryIdentity';
import SchedulingConflicts from '@/components/itinerary/SchedulingConflicts';
import BookingStatus from '@/components/itinerary/BookingStatus';
import MissingDetailsList from "@/components/trip/MissingDetailsList";
import { friendlyDate } from "@/lib/trip-presentation";
import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, Clock, Tag, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { STATUS_LABELS, validateTripForFinalize } from "@/lib/planningEngine";

export default function StepFinalize({ trip, dayWindows, places, tripItems = [], onFinalize, onGoToStep, onValidation }) {
  useLocale();
  const [meal,setMeal]=useState(null);
  const [walletItems,setWalletItems]=useState([]);
  useEffect(()=>{let active=true;api.wallet.list(trip.id).then(data=>{if(active)setWalletItems(data.items);}).catch(()=>{});return()=>{active=false;};},[trip.id]);
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Run validation
  const validation = useMemo(
    () => validateTripForFinalize({ trip, tripItems, places }),
    [trip, tripItems, places]
  );

  // Report essential count to parent (controls Finalize button)
  useEffect(() => {
    onValidation?.(validation.essential.length || (building || !result || saveError ? 1 : 0));
  }, [validation.essential.length, onValidation, building, result, saveError]);

  const hasEssential = validation.essential.length > 0;

  const handleBuild = async () => {
    setBuilding(true);
    setError("");
    setSaveError(false);
    try {
      const data = await api.buildItinerary(trip.id, { use_ai: true, expected_version: result?.version ?? trip.plan_version ?? 0 });
      setResult(data);
    } catch (e) {
      setSaveError(true);
      setError(e.message);
    }
    setBuilding(false);
  };

  // Opening a saved plan must never overwrite manual edits or trigger a paid call.
  useEffect(() => {
    let current = true;
    api.getItinerary(trip.id).then(data => { if (current) { if (data.items.length) setResult(data); setLoaded(true); } })
      .catch(failure => { if (current) { setError(failure.message); setSaveError(true); setLoaded(true); } });
    return () => { current = false; };
  }, [trip.id]);

  // Group items by date
  const byDate = {};
  if (result) {
    for (const date of result.dates || []) byDate[date] = [];
    result.items.forEach((it) => {
      if (!byDate[it.date]) byDate[it.date] = [];
      byDate[it.date].push(it);
    });
  }

  // "To book" list — visits needing tickets
  const toReserve = (result?.items || []).filter(item => item.step_type === 'visit' && item.ticket_status !== 'free');


  return (
    <div className="space-y-5">
      {meal&&<MealOptionsDialog trip={trip} item={meal} onClose={()=>setMeal(null)} onSaved={setResult}/>}
      {!hasEssential && loaded && <div className="space-y-2">
        <Button onClick={handleBuild} disabled={building} className="bg-lime text-neutral-900">{building ? t("ui.generating.d20a447") : result ? t("ui.regenerate.itinerary.813af6a") : t("ui.generate.itinerary.70f7c06")}</Button>
        {result && <p className="text-xs text-white/50">{t("ui.regeneration.replaces.the.schedule.using.your.current.planning.in.53330c2")}</p>}
        {result?.requiresRegeneration && <p role="status" className="text-sm text-white/70">{t("ui.this.saved.plan.uses.earlier.scheduling.rules.regenerate.to.apply.e5876e8")}</p>}
        {result?.stale && <p role="status" className="text-sm text-white/70">{t("ui.plan.changed.regenerate.to.apply.your.changes.db64b0f")}</p>}
        {result?.message && <p className="text-xs text-white/60">{translateText(result.message)}</p>}
      </div>}
      {/* Save error (technical) */}
      {saveError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">{t("ui.save.failed.53ad6f9")}</p>
              <p className="text-xs text-red-300/70 mt-1">{error || t("ui.a.technical.error.occurred.while.saving.your.data.is.preserved.2f535de")}</p>
              <Button onClick={handleBuild} variant="outline" size="sm" className="mt-2 border-red-400/40 text-red-300 hover:bg-red-500/10">{t("ui.try.again.d8b8392")}</Button>
            </div>
          </div>
        </div>
      )}

      <MissingDetailsList validation={validation} tripId={trip.id} onGoToStep={onGoToStep} />

      {/* Building indicator */}
      {building && !hasEssential && (
        <div className="flex items-center justify-center py-16 text-white/60">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />{" "}{t("ui.building.your.itinerary.67aa608")}</div>
      )}

      {/* Results — only when no essential issues and build succeeded */}
      {result && !hasEssential && (
        <>
          <MealReviewNotice choices={result.mealChoicesToReview}/>
   <OptionalPlaces places={result.unscheduledOptional} tripId={trip.id}/>
          <SchedulingConflicts conflicts={result.conflicts}/>

          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-lime" />
            <span className="text-white/80">{t("ui.status.755c8b2")}{" "}</span>
            <span className="font-semibold text-lime">{translateText(STATUS_LABELS[result.conflicts.length > 0 ? "needs_verification" : "calculated"])}</span>
          </div>

          {result.budgetExceeded && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <Tag className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{t("ui.activity.budget.exceeded.by.d848dd5")}{" "}{Math.round(result.totalActivityCost - (trip.budget_activities || 0))} {trip.currency || ""}{t('qa.budget.note')}
              </p>
            </div>
          )}
          {!result.budgetExceeded && trip.budget_activities > 0 && (
            <p className="text-xs text-white/40">{t("ui.activity.budget.e83e64b")}{" "}{Math.round(result.totalActivityCost || 0)} / {trip.budget_activities} {trip.currency || ""}
            </p>
          )}

          {/* Daily summary */}
          <div className="space-y-4">
            {Object.entries(byDate).map(([date, items], index) => {
              const visits = items.filter((i) => i.step_type === "visit");
              const transport = items.filter((i) => i.step_type === "transport");
              const totalWalk = transport.reduce((s, t) => s + (t.route_duration_min || 0), 0);
              const cost = visits.reduce((s, v) => s + (v.cost || 0), 0);
              return (
                <div key={date} className="itinerary-day-card">
                  <h3 className="itinerary-day-heading">{t("ui.day.8f2364e")}{" "}{index + 1} · {friendlyDate(date, { weekday: "short" })}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                    <span>{visits.length}{" "}{t("ui.visits.b944075")}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {totalWalk}{" "}{t("ui.min.transport.3d9fb40")}</span>
                    {cost > 0 && <span>{cost} {trip.currency || ""}</span>}
                  </div>
                  <div className="mt-3 space-y-1">
                    {items.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")).map((it, i) => (
                      <div key={it.id || i} className="itinerary-preview-row" data-itinerary-type={it.step_type}>
                        <ItineraryTime item={it}/><ItineraryIcon item={it} trip={trip}/>
                        <div className="itinerary-preview-content"><span className="itinerary-type-label">{translateText(itineraryIdentity(it,trip).label)}</span><h4>{translateText(it.title)}</h4>{it.location&&it.location!==it.title&&<p>{it.location}</p>}{it.step_type==='meal'&&<MealDetails item={it} onOptions={setMeal}/>}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* To book */}
          {toReserve.length > 0 && (
            <div className="itinerary-day-card">
              <h3 className="font-semibold text-white text-sm mb-3">{t("ui.tickets.bookings.7de6319")}</h3>
              <div className="space-y-2">
                {toReserve.map((p, i) => (
                  <div key={i} className="booking-ticket-row">
                    <div className="booking-ticket-name"><ItineraryIcon item={p} trip={trip}/><div>
                      <span className="text-white/80 font-medium">{translateText(p.title)}</span>
                      <span className="text-white/40 ml-2">{p.ticket_type}</span>
                    </div></div>
                    <BookingStatus item={p} tripId={trip.id} walletItems={walletItems} selections={places}/>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/40 mt-3">{t("ui.a.click.is.not.a.booking.after.booking.confirm.the.date.and.time.c5b0ed0")}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Link to="/?trips=1" className="text-sm text-white/70 px-3 py-2">{t("ui.close.itinerary.back.to.trips.b5d9609")}</Link>
            <Link to={`/trip/${trip.id}/itinerary`} className="flex-1">
              <Button className="w-full bg-lime text-neutral-900 hover:brightness-105 font-bold">{t("ui.view.full.itinerary.bc53287")}</Button>
            </Link>
          </div>
        </>
      )}

      {/* No issues at all — clean state */}
      {!loaded && !building && !saveError && (
        <div className="flex items-center justify-center py-16 text-white/60">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />{" "}{t("ui.preparing.5d1fa38")}</div>
      )}
    </div>
  );
}
