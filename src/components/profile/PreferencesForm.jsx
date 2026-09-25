import React, { useState } from "react";
import { api } from "@/api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";

export default function PreferencesForm({ user }) {
  const [dietary, setDietary] = useState(user.dietary_preference || "");
  const [airline, setAirline] = useState(user.preferred_airline || "");
  const [dream, setDream] = useState(user.dream_destination || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await api.auth.updateMe({ dietary_preference: dietary, preferred_airline: airline, dream_destination: dream });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dietary">Dietary Preference</Label>
          <Input id="dietary" value={dietary} onChange={(e) => setDietary(e.target.value)} placeholder="Vegetarian, Kosher, None…" className="h-12" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="airline">Preferred Airline</Label>
          <Input id="airline" value={airline} onChange={(e) => setAirline(e.target.value)} placeholder="Airline name…" className="h-12" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="dream">Dream Destination</Label>
          <Input id="dream" value={dream} onChange={(e) => setDream(e.target.value)} placeholder="Japan, Patagonia…" className="h-12" />
        </div>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="w-full sm:w-auto sm:px-8 h-12 rounded-xl bg-neutral-900 text-white font-semibold flex items-center justify-center gap-2 hover:bg-neutral-700 transition-colors disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4 text-lime" /> Saved</> : "Save Preferences"}
      </button>
    </form>
  );
}