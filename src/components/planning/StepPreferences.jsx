import FoodPreferences from './FoodPreferences';
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Clock } from "lucide-react";

const INTERESTS = [
  "Landmarks", "Museums", "Nature", "Views", "Food",
  "Beach", "Shopping", "Kids activities",
];
const EXCLUSIONS = ["No museums", "No difficult trails", "No water activities", "No shopping"];

export default function StepPreferences({ trip, update, dayWindows, onWindowsChange }) {
  const interests = (trip.interests || "").split(",").filter(Boolean);
  const exclusions = (trip.exclusions || "").split(",").filter(Boolean);

  const toggle = (field, val) => {
    const arr = (trip[field] || "").split(",").filter(Boolean);
    const next = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
    update(field, next.join(","));
  };

  const updateWindow = (idx, key, val) => {
    const next = [...dayWindows];
    next[idx] = { ...next[idx], [key]: val };
    onWindowsChange(next);
  };

  const addWindow = (idx) => {
    const next = [...dayWindows];
    const w = next[idx];
    const parsed = w.windows ? JSON.parse(w.windows) : [];
    parsed.push({ start: "09:30", end: "18:30" });
    next[idx] = { ...w, windows: JSON.stringify(parsed) };
    onWindowsChange(next);
  };

  const removeWindow = (dayIdx, wIdx) => {
    const next = [...dayWindows];
    const parsed = JSON.parse(next[dayIdx].windows || "[]");
    parsed.splice(wIdx, 1);
    next[dayIdx] = { ...next[dayIdx], windows: JSON.stringify(parsed) };
    onWindowsChange(next);
  };

  const addBlocked = (idx) => {
    const next = [...dayWindows];
    const w = next[idx];
    const parsed = w.blocked ? JSON.parse(w.blocked) : [];
    parsed.push({ start: "13:00", end: "14:00", reason: "Nap time" });
    next[idx] = { ...w, blocked: JSON.stringify(parsed) };
    onWindowsChange(next);
  };

  return (
    <div className="space-y-6">
      <FoodPreferences trip={trip} update={update}/>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Interests</h3>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((it) => (
            <button
              key={it}
              onClick={() => toggle("interests", it)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${interests.includes(it) ? "bg-lime text-neutral-900" : "bg-white/5 text-white/60 border border-white/10"}`}
            >
              {it}
            </button>
          ))}
        </div>
        <h4 className="text-xs text-white/50 mt-4">Exclusions</h4>
        <div className="flex flex-wrap gap-2">
          {EXCLUSIONS.map((ex) => (
            <button
              key={ex}
              onClick={() => toggle("exclusions", ex)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${exclusions.includes(ex) ? "bg-red-500/20 text-red-300 border border-red-500/40" : "bg-white/5 text-white/60 border border-white/10"}`}
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Pace</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: "relaxed", label: "Relaxed", desc: "Fewer places" },
            { key: "balanced", label: "Balanced", desc: "Moderate pace" },
            { key: "intense", label: "Intense", desc: "Many places" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => update("pace", p.key)}
              className={`rounded-xl border p-3 text-center transition-all ${trip.pace === p.key ? "border-lime bg-lime/10" : "border-white/10 bg-white/5"}`}
            >
              <span className="block text-sm font-semibold text-white">{p.label}</span>
              <span className="block text-xs text-white/40 mt-0.5">{p.desc}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-white/40">Intense pace doesn't mean skipping meals or exceeding opening hours. Values are explainable and editable.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Transport & walking</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-white/60">Transport preference</Label>
            <Select value={trip.transport_preference || ""} onValueChange={(v) => update("transport_preference", v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="walk">Walk</SelectItem>
                <SelectItem value="transit">Public transit</SelectItem>
                <SelectItem value="taxi">Taxi</SelectItem>
                <SelectItem value="car">Car</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-white/60">Max walking / day (min)</Label><Input type="number" value={trip.max_walk_per_day_min ?? ""} onChange={(e) => update("max_walk_per_day_min", parseInt(e.target.value) || 0)} className="bg-white/5 border-white/10 text-white" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-white/60">Max walking / segment (min)</Label><Input type="number" value={trip.max_walk_per_segment_min ?? ""} onChange={(e) => update("max_walk_per_segment_min", parseInt(e.target.value) || 0)} className="bg-white/5 border-white/10 text-white" /></div>
          <div><Label className="text-white/60">Time buffer / segment (min)</Label><Input type="number" value={trip.buffer_min ?? 15} onChange={(e) => update("buffer_min", parseInt(e.target.value) || 15)} className="bg-white/5 border-white/10 text-white" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-white/60">Meal duration (min)</Label><Input type="number" value={trip.meal_duration_min ?? 60} onChange={(e) => update("meal_duration_min", parseInt(e.target.value) || 60)} className="bg-white/5 border-white/10 text-white" /></div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer pb-2">
              <input type="checkbox" checked={!!trip.stroller} onChange={(e) => update("stroller", e.target.checked)} className="accent-lime w-4 h-4" />
              Stroller
            </label>
          </div>
        </div>
        <div><Label className="text-white/60">Declared mobility needs</Label><Input value={trip.mobility_needs || ""} onChange={(e) => update("mobility_needs", e.target.value)} placeholder="e.g. avoid stairs" className="bg-white/5 border-white/10 text-white" /></div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Daily planning hours</h3>
        <p className="text-xs text-white/60">Set the hours when you'd like activities to be planned each day. Flights and confirmed reservations remain fixed.</p>
        <div className="space-y-3">
          {dayWindows.map((dw, idx) => {
            const windows = dw.windows ? JSON.parse(dw.windows) : [];
            const blocked = dw.blocked ? JSON.parse(dw.blocked) : [];
            return (
              <div key={idx} className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-lime" />
                  <span className="text-sm font-semibold text-white">{dw.date}</span>
                </div>
                <div className="space-y-1.5">
                  {windows.map((w, wi) => (
                    <div key={wi} className="flex items-center gap-2">
                      <Input type="time" value={w.start} onChange={(e) => {
                        const next = [...windows]; next[wi] = { ...w, start: e.target.value }; updateWindow(idx, "windows", JSON.stringify(next));
                      }} className="bg-white/5 border-white/10 text-white w-28" />
                      <span className="text-white/40">→</span>
                      <Input type="time" value={w.end} onChange={(e) => {
                        const next = [...windows]; next[wi] = { ...w, end: e.target.value }; updateWindow(idx, "windows", JSON.stringify(next));
                      }} className="bg-white/5 border-white/10 text-white w-28" />
                      <button onClick={() => removeWindow(idx, wi)} className="text-white/40 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addWindow(idx)} className="mt-2 flex items-center gap-1 text-xs text-lime hover:text-lime/80"><Plus className="w-3 h-3" /> Add interval</button>
                {blocked.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <p className="text-xs text-white/40 mb-1">Unavailable:</p>
                    {blocked.map((b, bi) => (
                      <div key={bi} className="flex flex-wrap items-center gap-2 mt-2">
                        <Input aria-label={`Blocked start ${dw.date}`} type="time" value={b.start} onChange={event=>{const next=[...blocked];next[bi]={...b,start:event.target.value};updateWindow(idx,'blocked',JSON.stringify(next));}} className="w-28 bg-white/5 text-white"/>
                        <span className="text-white/60">→</span>
                        <Input aria-label={`Blocked end ${dw.date}`} type="time" value={b.end} onChange={event=>{const next=[...blocked];next[bi]={...b,end:event.target.value};updateWindow(idx,'blocked',JSON.stringify(next));}} className="w-28 bg-white/5 text-white"/>
                        <Input aria-label={`Blocked reason ${dw.date}`} value={b.reason||''} onChange={event=>{const next=[...blocked];next[bi]={...b,reason:event.target.value};updateWindow(idx,'blocked',JSON.stringify(next));}} className="flex-1 min-w-24 bg-white/5 text-white"/>
                        <button aria-label={`Remove blocked interval ${bi+1} on ${dw.date}`} onClick={()=>updateWindow(idx,'blocked',JSON.stringify(blocked.filter((_,i)=>i!==bi)))} className="text-white/60 hover:text-red-300"><Trash2 size={16}/></button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => addBlocked(idx)} className="mt-1 flex items-center gap-1 text-xs text-white/40 hover:text-white/60"><Plus className="w-3 h-3" /> Block interval</button>
              </div>
            );
          })}
        </div>
      </section>
      <section className="space-y-3">
        <label htmlFor="special-wishes" className="block text-sm font-semibold text-white/80 uppercase tracking-wider">Special wishes</label>
        <p className="text-sm text-white/60">Anything else TripSync should consider when suggesting places or building your itinerary?</p>
        <textarea id="special-wishes" maxLength={4000} rows={5} value={trip.special_wishes || ''} onChange={event => update('special_wishes', event.target.value)} placeholder="Keep one afternoon completely free. Avoid early mornings. Prefer local restaurants." className="w-full rounded-xl border border-white/20 bg-white/5 p-3 text-white" />
        <p className="text-xs text-white/50">Saved with your preferences. Flights, confirmed reservations and accessibility needs remain protected.</p>
      </section>
    </div>
  );
}
