import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { TripLoading } from '@/components/trip/TripUI';
import { validateTripForFinalize } from '@/lib/planningEngine';
import { api } from "@/api/client";
import WizardShell from "@/components/planning/WizardShell";
import StepTrip from "@/components/planning/StepTrip";
import StepStay from "@/components/planning/StepStay";
import StepPreferences from "@/components/planning/StepPreferences";
import StepPlaces from "@/components/planning/StepPlaces";
import StepSuggestions from "@/components/planning/StepSuggestions";
import StepFinalize from "@/components/planning/StepFinalize";

function generateDays(start, end, tripId, existing = []) {
  const first = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  if (Number.isNaN(+first) || Number.isNaN(+last) || last < first || (+last - +first) / 86400000 > 365) {
    throw new Error("Choose valid trip dates, up to one year apart.");
  }
  const days = [];
  for (let day = new Date(first); day <= last; day.setDate(day.getDate() + 1)) {
    const date = [day.getFullYear(), String(day.getMonth() + 1).padStart(2, "0"), String(day.getDate()).padStart(2, "0")].join("-");
    days.push(existing.find(w => w.date === date) || {
      id: crypto.randomUUID(), trip_id: tripId, date,
      windows: JSON.stringify([{ start: "09:30", end: "18:30" }]), blocked: "[]", start_point: "Hotel", end_point: "Hotel",
    });
  }
  return days;
}

export default function PlanVisits() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [search,setSearch] = useSearchParams();
  const [trip, setTrip] = useState(null);
  const [places, setPlaces] = useState([]);
  const [dayWindows, setDayWindows] = useState([]);
  const [stays, setStays] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [step, setStep] = useState(0);
  const [essentialCount, setEssentialCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const tripRef = useRef(null);
  const staysRef = useRef([]);
  const pending = useRef(new Map());
  const failed = useRef(new Map());
  const queue = useRef(Promise.resolve());
  const running = useRef(0);

  async function load() {
    try {
      const [t, p, windows, items] = await Promise.all([
        api.entities.Trip.get(tripId),
        api.entities.PlaceSelection.filter({ trip_id: tripId }, "created_date", 1000),
        api.entities.DayWindow.filter({ trip_id: tripId }, "date", 1000),
        api.entities.TripItem.filter({ trip_id: tripId }, "created_date", 1000),
      ]);
      let days = windows;
      if (t.start_date && t.end_date && !days.length) {
        days = generateDays(t.start_date, t.end_date, tripId);
      }
      tripRef.current = t;
      staysRef.current = items.filter(i => i.category === "stay");
      if (!staysRef.current.length) staysRef.current = [{}];
      setTrip(t); setPlaces(p); setDayWindows(days); setAllItems(items); setStays(staysRef.current);
      const requested=Number(search.get('step'));
      setStep(search.has('step')&&Number.isInteger(requested)&&requested>=0&&requested<6?requested:Math.min(5,Math.max(0,t.planning_step || 0))); setSaveError("");
    } catch (error) { setSaveError(error.message); }
  }
  useEffect(() => { load(); }, [tripId]);
  useEffect(()=>{const requested=Number(search.get('step'));if(search.has('step')&&Number.isInteger(requested)&&requested>=0&&requested<6)setStep(requested);},[search]);

  function schedule(key, task) {
    const old = pending.current.get(key);
    if (old) clearTimeout(old.timer);
    setSaving(true);
    const run = () => {
      pending.current.delete(key);
      running.current++;
      queue.current = queue.current.then(task).then(() => {
        failed.current.delete(key);
        if (!failed.current.size) setSaveError("");
      }).catch(error => {
        failed.current.set(key, task);
        setSaveError(error.message);
      }).finally(() => {
        running.current--;
        setSaving(Boolean(pending.current.size || running.current));
      });
    };
    pending.current.set(key, { timer: setTimeout(run, 500), run });
  }

  async function flush() {
    for (const [key, task] of failed.current) if (!pending.current.has(key)) schedule(key, task);
    for (const job of [...pending.current.values()]) { clearTimeout(job.timer); job.run(); }
    await queue.current;
    if (failed.current.size) throw new Error("Some changes could not be saved. Please retry.");
  }

  useEffect(() => {
    const warn = event => {
      if (pending.current.size || running.current || failed.current.size) {
        event.preventDefault(); event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      for (const job of [...pending.current.values()]) { clearTimeout(job.timer); job.run(); }
    };
  }, []);

  function updateTrip(field, value) {
    const patch = typeof field === 'object' ? field : { [field]: value };
    const next = { ...tripRef.current, ...patch };
    if (field === 'destination' && value !== tripRef.current.destination && tripRef.current.destination_place_id) {
      for (const key of ['destination_city', 'destination_formatted_address', 'destination_place_id', 'destination_latitude', 'destination_longitude', 'country', 'timezone']) next[key] = null;
    }
    for (const direction of ['arrival', 'departure']) {
      if (field === `${direction}_location` && value !== tripRef.current[field]) {
        for (const suffix of ['place_id','address','city','country','lat','lng']) next[`${direction}_${suffix}`] = null;
      }
    }
    tripRef.current = next; setTrip(next);
    schedule("trip", () => api.entities.Trip.update(tripId, next));
  }
  function savePlaces(next) {
    const records = next.map(p => ({ ...p, id: p.id || crypto.randomUUID(), trip_id: tripId }));
    setPlaces(records);
    schedule("places", () => api.savePlanning(tripId, "places", records));
  }
  function saveWindows(next) {
    const records = next.map(w => ({ ...w, id: w.id || crypto.randomUUID(), trip_id: tripId }));
    setDayWindows(records);
    schedule("windows", () => api.savePlanning(tripId, "windows", records));
  }
  function onStayChange(idx, data) {
    const next = [...staysRef.current];
    if (typeof data === 'function') data = data(next[idx] || {});
    next[idx] = { ...data, id: data.id || next[idx]?.id || crypto.randomUUID(), title: data.title || "Accommodation", trip_id: tripId, category: "stay" };
    staysRef.current = next; setStays(next);
    schedule("stays", () => api.savePlanning(tripId, "stays", next.filter(item => item.id)));
  }
  async function changeStep(nextStep) {
    setSaving(true);
    try {
      await flush();
      const current = tripRef.current;
      if (nextStep > 0 && current.start_date && current.end_date) {
        const existing = await api.entities.DayWindow.filter({ trip_id: tripId }, "date", 1000);
        setDayWindows(await api.savePlanning(tripId, "windows", generateDays(current.start_date, current.end_date, tripId, existing)));
      }
      const updated = await api.entities.Trip.update(tripId, { planning_step: nextStep });
      tripRef.current = updated; setTrip(updated);
      setAllItems(await api.entities.TripItem.filter({ trip_id: tripId }, "created_date", 1000));
      setStep(nextStep); setSearch({step:String(nextStep)}); setSaveError("");
    } catch (error) { setSaveError(error.message); }
    finally { setSaving(false); }
  }
  const finalized = () => navigate("/trip/" + tripId + "/itinerary");
  if (!trip) return <TripLoading error={saveError} retry={load}/>;
  const validation=validateTripForFinalize({trip,tripItems:allItems,places});
  const states=[validation.essential.length?'missing':'complete',stays.some(stay=>stay.address&&stay.date&&stay.end_date)?'complete':trip.stay_status==='none'?'complete':'',trip.pace?'complete':'',places.some(place=>place.priority==='mandatory')?'complete':'',places.some(place=>place.selection_source==='ai'&&place.priority!=='candidate')?'complete':'',trip.itinerary_meta?'complete':''];
  return <WizardShell tripId={tripId} trip={trip} step={step} setStep={changeStep} saving={saving} beforeNavigate={flush} states={states} saveError={saveError} onUpdated={updated=>{tripRef.current=updated;setTrip(updated);}}
    onPrev={() => changeStep(Math.max(0, step - 1))}
    onNext={() => step === 5 ? finalized() : changeStep(step + 1)}
    nextLabel={step === 5 ? "View itinerary" : "Save & continue"}
    canNext={!saving && !saveError && (step !== 5 || essentialCount === 0)}>
    {saveError && <div role="alert" className="p-3 text-red-300"><p>{saveError}</p>
      <button className="underline" onClick={() => flush().then(() => setSaveError("")).catch(error => setSaveError(error.message))}>Retry saving</button>
    </div>}
    {step === 0 && <StepTrip trip={trip} update={updateTrip} />}
    {step === 1 && <StepStay tripId={tripId} trip={trip} update={updateTrip} stays={stays} onStayChange={onStayChange} />}
    {step === 2 && <StepPreferences trip={trip} update={updateTrip} dayWindows={dayWindows} onWindowsChange={saveWindows} />}
    {step === 3 && <StepPlaces key={tripId} tripId={tripId} trip={trip} places={places} onPlacesChange={savePlaces} />}
    {step === 4 && <StepSuggestions key={tripId} trip={trip} dayWindows={dayWindows} places={places} onPlacesChange={savePlaces} beforeGenerate={flush} />}
    {step === 5 && <StepFinalize trip={trip} dayWindows={dayWindows} places={places} tripItems={allItems} onFinalize={finalized} onGoToStep={changeStep} onValidation={setEssentialCount} />}
  </WizardShell>;
}
