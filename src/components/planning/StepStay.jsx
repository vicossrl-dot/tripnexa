import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle, CheckCircle2, Bed, Calculator } from "lucide-react";
import { api } from "@/api/client";
import { formatCurrency } from "@/lib/currencyUtils";
import DestinationAutocomplete from '@/components/home/DestinationAutocomplete';
import PrivateFileField from './PrivateFileField';
import { useCapabilities } from "@/hooks/use-capabilities";

export default function StepStay({ tripId, trip, update, stays, onStayChange }) {
  const capabilities = useCapabilities();
  const [status, setStatus] = useState(trip.stay_status || "");
  const [importing, setImporting] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState("");

  const [preview, setPreview] = useState(null);
  const stay = stays[0];
  const saveStay = patch => onStayChange(0, current => ({ ...current, ...patch, category: 'stay', trip_id: tripId }));
  const selectHotel = place => saveStay({ title: place.name, address: place.address, city: place.city, country: place.country, place_id: place.place_id, lat: place.lat, lng: place.lng, source_status: 'api_provided', verified_at: null });
  const manualHotel = (key, value) => saveStay({ [key]: value, place_id: null, lat: null, lng: null, city: null, country: null, source_status: 'unknown', verified_at: null });

  const pickStatus = (s) => {
    setStatus(s);
    update("stay_status", s);
  };

  const extract = async (source) => {
    setImporting(true); setImportError(''); setPreview(null);
    try { setPreview({ ...await api.extractStay({ trip_id: tripId, ...source }), url: source.url || null }); }
    catch (error) { setImportError(error.message); }
    finally { setImporting(false); }
  };
  const handleImport = () => extract({ url: importUrl.trim() });
  const confirmPreview = () => {
    const data = preview.data;
    saveStay({ ...data, ...(preview.url ? { url: preview.url } : {}), place_id: null,
      lat: preview.data.lat, lng: preview.data.lng, source_status: 'confirmed_by_user', verified_at: new Date().toISOString() });
    setPreview(null);
  };

  const field = (k) => ({
    value: stay?.[k] || "",
    onChange: (e) => onStayChange(0, { ...stay, [k]: e.target.value, category: "stay", trip_id: tripId }),
  });

  // Budget calculations for "no stay" mode
  const childrenAges = (trip.children_ages || "").split(",").filter(Boolean);
  const totalPeople = (trip.adults || 0) + childrenAges.length;
  const nights = (() => {
    if (!trip.start_date || !trip.end_date) return 0;
    const s = new Date(trip.start_date + "T00:00:00");
    const e = new Date(trip.end_date + "T00:00:00");
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
  })();
  const budgetMode = trip.budget_accommodation_mode || "total";
  const budgetAmount = trip.budget_accommodation || 0;
  const totalBudget = budgetMode === "per_person" ? budgetAmount * totalPeople : budgetAmount;
  const perNight = nights > 0 ? totalBudget / nights : 0;
  const currency = trip.currency || "EUR";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Have you booked your stay?</h3>
        <div className="grid grid-cols-1 gap-2">
          {[
            { key: "booked", label: "Yes, I've booked", desc: "I have the confirmation" },
            { key: "chosen", label: "I've chosen, not booked yet", desc: "Using it as a reference" },
            { key: "none", label: "No, help me find one", desc: "I need accommodation suggestions" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => pickStatus(opt.key)}
              className={`text-left rounded-xl border p-4 transition-all ${status === opt.key ? "border-lime bg-lime/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}
            >
              <div className="flex items-center gap-2">
                {status === opt.key ? <CheckCircle2 className="w-4 h-4 text-lime" /> : <div className="w-4 h-4 rounded-full border border-white/30" />}
                <span className="font-semibold text-white">{opt.label}</span>
              </div>
              <p className="text-xs text-white/40 mt-1 ml-6">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {(status === "booked" || status === "chosen") && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider flex items-center gap-2"><Bed className="w-4 h-4 text-lime" /> Stay details</h3>
          <div>
            <Label className="text-white/60">Import from link</Label>
            <div className="flex gap-2">
              <Input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://booking.com/…" className="bg-white/5 border-white/10 text-white" />
              <Button onClick={handleImport} disabled={importing || !importUrl.trim()} className="bg-lime text-neutral-900 hover:brightness-105 shrink-0">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Read"}
              </Button>
            </div>
            {importError && <p className="text-xs text-red-400 mt-1">{importError}</p>}
            <p className="text-xs text-white/40 mt-1">We read public page metadata first. If blocked, AI can look for public hotel details. Review every result before saving.</p>
          </div>
          <PrivateFileField label="Reservation PDF / image" value={stay?.reservation_file_url} onChange={url => { saveStay({ reservation_file_url: url }); setPreview(null); }} />
          {stay?.reservation_file_url && <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white" disabled={!capabilities.ai || importing} onClick={() => extract({ file_url: stay.reservation_file_url })}>{importing ? 'Reading reservation…' : 'Extract reservation details'}</Button>}
          <p className="text-xs text-white/40">Extracting a file sends it securely from the backend to the configured AI provider. It is not published or included in public sharing.</p>
          {preview && <div role="region" aria-label="Hotel import preview" className="rounded-xl border border-lime/40 bg-lime/5 p-4 space-y-3">
            <h4 className="text-white font-semibold">Review hotel details before saving</h4>
            {preview.warnings.map((warning, i) => <p key={i} className="text-xs text-amber-200">{warning}</p>)}
            <div className="grid sm:grid-cols-2 gap-3">{[['title','Hotel name'],['address','Address'],['city','City'],['country','Country'],['date','Check-in date'],['end_date','Check-out date'],['check_in_time','Check-in time'],['check_out_time','Check-out time'],['confirmation_number','Confirmation / reference']].map(([key,label]) => <label key={key} className="text-xs text-white/60">{label}<Input aria-label={'Preview ' + label} type={['date','end_date'].includes(key) ? 'date' : key.endsWith('_time') ? 'time' : 'text'} value={preview.data[key] || ''} onChange={event => setPreview({ ...preview, data: { ...preview.data, [key]: event.target.value } })} className="bg-white/5 border-white/10 text-white" /></label>)}</div>
            <div className="flex flex-wrap gap-3"><Button disabled={!preview.data.title?.trim() || !preview.data.address?.trim()} onClick={confirmPreview} className="bg-lime text-neutral-900">Confirm hotel details</Button><Button variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white" onClick={() => setPreview(null)}>Discard preview</Button></div>
          </div>}
          <DestinationAutocomplete purpose="place" keepSelection id="stay-hotel" label="Hotel name" kind="hotel" destination={trip.destination || ''} latitude={trip.destination_latitude} longitude={trip.destination_longitude} value={stay?.title === 'Accommodation' ? '' : stay?.title || ''} onChange={value => manualHotel('title', value)} onSelect={selectHotel} />
          <DestinationAutocomplete purpose="place" keepSelection addressField id="stay-address" label="Exact address" destination={trip.destination || ''} latitude={trip.destination_latitude} longitude={trip.destination_longitude} value={stay?.address || ''} onChange={value => manualHotel('address', value)} onSelect={place => { if (place.category === 'street_address' || place.category === 'premise' || !place.category) saveStay({ address: place.address, city: place.city, country: place.country, lat: place.lat, lng: place.lng, place_id: place.place_id, source_status: 'api_provided', verified_at: null }); else selectHotel(place); }} />
          <div className="grid grid-cols-2 gap-3"><div><Label className="text-white/60">City</Label><Input {...field('city')} className="bg-white/5 border-white/10 text-white" /></div><div><Label className="text-white/60">Country</Label><Input {...field('country')} className="bg-white/5 border-white/10 text-white" /></div></div>
          <div><Label className="text-white/60">Confirmation / reference</Label><Input {...field('confirmation_number')} className="bg-white/5 border-white/10 text-white" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-white/60">Check-in</Label><Input type="date" {...field("date")} className="bg-white/5 border-white/10 text-white" /></div>
            <div><Label className="text-white/60">Check-out</Label><Input type="date" {...field("end_date")} className="bg-white/5 border-white/10 text-white" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-white/60">Check-in time</Label><Input type="time" {...field("check_in_time")} className="bg-white/5 border-white/10 text-white" /></div>
            <div><Label className="text-white/60">Check-out time</Label><Input type="time" {...field("check_out_time")} className="bg-white/5 border-white/10 text-white" /></div>
          </div>
          {status === "chosen" && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">Unconfirmed stay — used as a reference, but we don't assume early check-in or luggage storage.</p>
            </div>
          )}
          <p className="text-xs text-white/40">This address is used as the start and end point for each day's itinerary.</p>
        </section>
      )}

      {status === "none" && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider flex items-center gap-2"><Calculator className="w-4 h-4 text-lime" /> Accommodation budget</h3>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white/60">Budget type</Label>
              <Select 
                value={budgetMode} 
                onValueChange={(v) => update("budget_accommodation_mode", v)}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total for stay</SelectItem>
                  <SelectItem value="per_person">Per person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/60">Amount ({currency})</Label>
              <Input 
                type="number" 
                value={budgetAmount || ""} 
                onChange={(e) => update("budget_accommodation", parseFloat(e.target.value) || 0)} 
                placeholder="300" 
                className="bg-white/5 border-white/10 text-white" 
              />
            </div>
          </div>

          {budgetAmount > 0 && (
            <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">People included</span>
                <span className="text-white font-semibold">{totalPeople} ({trip.adults || 0} adults{childrenAges.length > 0 ? `, ${childrenAges.length} children` : ""})</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Nights</span>
                <span className="text-white font-semibold">{nights || "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Rooms</span>
                <span className="text-white font-semibold">{trip.rooms || 1}</span>
              </div>
              <div className="border-t border-lime/20 pt-2 mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-white/80 font-medium">Total budget</span>
                  <span className="text-lime font-bold text-lg">{formatCurrency(totalBudget, currency)}</span>
                </div>
                {nights > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Avg per night (all rooms)</span>
                    <span className="text-white font-semibold">{formatCurrency(Math.round(perNight), currency)}</span>
                  </div>
                )}
              </div>
              {budgetMode === "per_person" && (
                <p className="text-xs text-white/40 pt-1">
                  {formatCurrency(budgetAmount, currency)} × {totalPeople} people = {formatCurrency(totalBudget, currency)} for the entire stay
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="text-white/60">Important preferences</Label>
            <Textarea 
              placeholder="Breakfast, parking, cancellation, accessibility, quiet area, near transit…" 
              className="bg-white/5 border-white/10 text-white"
              value={trip.interests || ""}
              onChange={(e) => update("interests", e.target.value)}
            />
          </div>
          <div><Label className="text-white/60">Place that determines the area (optional)</Label><Input placeholder="e.g. a theme park" className="bg-white/5 border-white/10 text-white" /></div>
          
          <div className="bg-white/5 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-white/80">Suggested areas</p>
            <p className="text-xs text-white/40">Without an approved hotel API, we recommend areas and offer search through affiliate tools. We don't invent availability or prices. You can use a provisional area — the impact on accuracy remains visible.</p>
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">Search hotels (affiliate link)</Button>
          </div>
        </section>
      )}
    </div>
  );
}
