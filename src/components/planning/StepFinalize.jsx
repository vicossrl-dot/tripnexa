import MealReviewNotice from '@/components/itinerary/MealReviewNotice';
import MealOptionsDialog from '@/components/itinerary/MealOptionsDialog';
import MealDetails from '@/components/itinerary/MealDetails';
import OptionalPlaces from '@/components/itinerary/OptionalPlaces';
import { itineraryTimeLabel } from '@/lib/itinerary-time-label';
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
        <Button onClick={handleBuild} disabled={building} className="bg-lime text-neutral-900">{building ? 'Generating…' : result ? 'Regenerate itinerary' : 'Generate itinerary'}</Button>
        {result && <p className="text-xs text-white/50">Regeneration replaces the schedule using your current planning inputs. Opening the itinerary preserves your edits.</p>}
        {result?.requiresRegeneration && <p role="status" className="text-sm text-white/70">This saved plan uses earlier scheduling rules. Regenerate to apply improved priorities and overnight travel handling. Your saved schedule is unchanged until then.</p>}
        {result?.stale && <p role="status" className="text-sm text-white/70">Plan changed. Regenerate to apply your changes.</p>}
        {result?.message && <p className="text-xs text-white/60">{result.message}</p>}
      </div>}
      {/* Save error (technical) */}
      {saveError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Save failed</p>
              <p className="text-xs text-red-300/70 mt-1">{error || 'A technical error occurred while saving. Your data is preserved.'}</p>
              <Button onClick={handleBuild} variant="outline" size="sm" className="mt-2 border-red-400/40 text-red-300 hover:bg-red-500/10">
                Try again
              </Button>
            </div>
          </div>
        </div>
      )}

      <MissingDetailsList validation={validation} tripId={trip.id} onGoToStep={onGoToStep} />

      {/* Building indicator */}
      {building && !hasEssential && (
        <div className="flex items-center justify-center py-16 text-white/60">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Building your itinerary…
        </div>
      )}

      {/* Results — only when no essential issues and build succeeded */}
      {result && !hasEssential && (
        <>
          <MealReviewNotice choices={result.mealChoicesToReview}/>
   <OptionalPlaces places={result.unscheduledOptional} tripId={trip.id}/>
          {result.conflicts.length > 0 && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
              <p className="text-sm font-semibold text-amber-200 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Scheduling conflicts</p>
              <ul className="mt-2 space-y-1">
                {result.conflicts.map((c, i) => (
                  <li key={i} className="text-xs text-amber-200/80">• <strong>{c.place}</strong> {c.date ? ` (${c.date})` : ''}: {c.reason}</li>
                ))}
              </ul>
              <p className="text-xs text-amber-200/60 mt-2">Alternatives: different day/time, different transport, extending a window, dropping or downgrading a place.</p>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-lime" />
            <span className="text-white/80">Status: </span>
            <span className="font-semibold text-lime">{STATUS_LABELS[result.conflicts.length > 0 ? "needs_verification" : "calculated"]}</span>
          </div>

          {result.budgetExceeded && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <Tag className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">
                Activity budget exceeded by {Math.round(result.totalActivityCost - (trip.budget_activities || 0))} {trip.currency || ""}.
                Reduce places or increase the budget in step 1.
              </p>
            </div>
          )}
          {!result.budgetExceeded && trip.budget_activities > 0 && (
            <p className="text-xs text-white/40">
              Activity budget: {Math.round(result.totalActivityCost || 0)} / {trip.budget_activities} {trip.currency || ""}
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
                <div key={date} className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <h3 className="font-semibold text-white text-sm mb-2">Day {index + 1} · {friendlyDate(date, { weekday: "short" })}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                    <span>{visits.length} visits</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {totalWalk} min transport</span>
                    {cost > 0 && <span>{cost} {trip.currency || ""}</span>}
                  </div>
                  <div className="mt-3 space-y-1">
                    {items.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")).map((it, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-white/50 w-32 shrink-0">{itineraryTimeLabel(it)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${it.step_type === "visit" ? "bg-lime/20 text-lime" : it.step_type === "transport" ? "bg-blue-500/20 text-blue-300" : it.step_type === "meal" ? "bg-orange-500/20 text-orange-300" : "bg-white/10 text-white/50"}`}>{it.step_type}</span>
                        <span className="text-white/70 truncate">{it.title}</span>
                        {it.step_type==='meal'&&<div className="basis-full"><MealDetails item={it} onOptions={setMeal}/></div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* To book */}
          {toReserve.length > 0 && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <h3 className="font-semibold text-white text-sm mb-3">Tickets & bookings</h3>
              <div className="space-y-2">
                {toReserve.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="text-white/80 font-medium">{p.title}</span>
                      <span className="text-white/40 ml-2">{p.ticket_type}</span>
                    </div>
                    <BookingStatus item={p} tripId={trip.id} walletItems={walletItems} selections={places}/>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/40 mt-3">A click is not a booking. After booking, confirm the date and time — if it differs, we recalculate the itinerary around it.</p>
            </div>
          )}

          <div className="flex gap-2">
            <Link to="/?trips=1" className="text-sm text-white/70 px-3 py-2">Close itinerary / Back to trips</Link>
            <Link to={`/trip/${trip.id}/itinerary`} className="flex-1">
              <Button className="w-full bg-lime text-neutral-900 hover:brightness-105 font-bold">
                View full itinerary
              </Button>
            </Link>
          </div>
        </>
      )}

      {/* No issues at all — clean state */}
      {!loaded && !building && !saveError && (
        <div className="flex items-center justify-center py-16 text-white/60">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Preparing…
        </div>
      )}
    </div>
  );
}
