import React, { useState } from "react";
import { api } from "@/api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";

export default function ProfileForm({ user }) {
  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [homeCity, setHomeCity] = useState(user.home_city || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await api.auth.updateMe({ display_name: displayName, phone, home_city: homeCity });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="display_name">Display Name</Label>
          <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How should we call you?" className="h-12" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+972 50 000 0000" className="h-12" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="home_city">Home City</Label>
          <Input id="home_city" value={homeCity} onChange={(e) => setHomeCity(e.target.value)} placeholder="Tel Aviv" className="h-12" />
        </div>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="w-full sm:w-auto sm:px-8 h-12 rounded-xl bg-neutral-900 text-white font-semibold flex items-center justify-center gap-2 hover:bg-neutral-700 transition-colors disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4 text-lime" /> Saved</> : "Save Changes"}
      </button>
    </form>
  );
}