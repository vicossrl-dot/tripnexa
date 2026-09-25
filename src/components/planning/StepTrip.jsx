import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Stepper from "@/components/ui/stepper";
import { SUPPORTED_CURRENCIES, fetchExchangeRate } from "@/lib/currencyUtils";
import { Globe, Loader2 } from "lucide-react";
import TravelTypeField from '@/components/trip/TravelTypeField';
import DestinationAutocomplete from '@/components/home/DestinationAutocomplete';
import PrivateFileField from './PrivateFileField';

export default function StepTrip({ trip, update }) {
  const set = (k) => (e) => update(k, e.target.value);
  const childrenAges = (trip.children_ages || "").split(",").filter(Boolean);
  const [tzLoading, setTzLoading] = useState(false);
  const [tzError, setTzError] = useState("");

  // Google selection supplies timezone atomically. Manual entries use the explicit Auto action,
  // avoiding racing country/timezone requests for every partial destination keystroke.

  const detectTimezone = async () => {
    if (!trip.destination) return;
    setTzLoading(true);
    setTzError("");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trip.destination)}&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      if (data && data[0]) {
        const { lat, lon } = data[0];
        // Fallback: use a simple lookup via the coordinates
        const tzLookup = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=5&accept-language=en`
        ).catch(() => null);
        if (tzLookup && tzLookup.ok) {
          const revData = await tzLookup.json();
          const country = revData?.address?.country;
          if (country) update("country", country);
        }
        // Try to get timezone from a free service
        const tzByCoord = await fetch(
          `https://www.timeapi.io/api/Time/current/coordinate?latitude=${lat}&longitude=${lon}`
        ).catch(() => null);
        if (tzByCoord && tzByCoord.ok) {
          const tzData = await tzByCoord.json();
          if (tzData?.timeZone) {
            update("timezone", tzData.timeZone);
            setTzLoading(false);
            return;
          }
        }
        // If we can't auto-detect, leave blank with a hint
        setTzError("Couldn't auto-detect timezone. Please select manually.");
      }
    } catch (e) {
      setTzError("Couldn't auto-detect timezone. Please select manually.");
    }
    setTzLoading(false);
  };

  const handleCurrencyChange = async (newCurrency) => {
    const oldCurrency = trip.currency || "EUR";
    if (oldCurrency === newCurrency) return;
    
    // Store original currency if not already set
    if (!trip.original_currency) {
      update("original_currency", oldCurrency);
    }
    
    // Fetch exchange rate
    const rateInfo = await fetchExchangeRate(oldCurrency, newCurrency);
    if (rateInfo) {
      update("exchange_rate", rateInfo.rate);
      update("exchange_rate_updated_at", new Date().toISOString());
    }
    update("currency", newCurrency);
  };

  const nights = (() => {
    if (!trip.start_date || !trip.end_date) return 0;
    const s = new Date(trip.start_date + "T00:00:00");
    const e = new Date(trip.end_date + "T00:00:00");
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
  })();

  const totalPeople = (trip.adults || 0) + childrenAges.length;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Destination & time</h3>
        <TravelTypeField dark value={trip.travel_type} onChange={value => update('travel_type', value || null)} />
        <div className="grid grid-cols-2 gap-3">
          <DestinationAutocomplete dark id="planner-destination" label="Exact destination" value={trip.destination || ''} onChange={value => update('destination', value)} onSelect={details => update(details)} />
          <div><Label className="text-white/60">Country</Label><Input value={trip.country || ""} onChange={set("country")} placeholder="Spain" className="bg-white/5 border-white/10 text-white" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-white/60">Arrival</Label><Input type="date" value={trip.start_date || ""} onChange={set("start_date")} className="bg-white/5 border-white/10 text-white" /></div>
          <div><Label className="text-white/60">Departure</Label><Input type="date" value={trip.end_date || ""} onChange={set("end_date")} className="bg-white/5 border-white/10 text-white" /></div>
        </div>
        {trip.start_date && trip.end_date && trip.end_date < trip.start_date && (
          <p className="text-xs text-red-400">Departure must be on or after arrival.</p>
        )}
        {nights > 0 && <p className="text-xs text-white/40">{nights} {nights === 1 ? "night" : "nights"}</p>}
        <div>
          <Label className="text-white/60">Local timezone</Label>
          <div className="flex gap-2">
            <Input value={trip.timezone || ""} onChange={set("timezone")} placeholder="Europe/Madrid" className="bg-white/5 border-white/10 text-white" />
            <button
              type="button"
              onClick={detectTimezone}
              disabled={tzLoading || !trip.destination}
              className="shrink-0 rounded-lg bg-white/5 border border-white/10 px-3 flex items-center gap-1.5 text-xs text-white/60 hover:bg-white/10 disabled:opacity-30"
            >
              {tzLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
              Auto
            </button>
          </div>
          {tzError && <p className="text-xs text-amber-300 mt-1">{tzError}</p>}
          <p className="text-xs text-white/40 mt-1">IANA timezone ID (e.g. Europe/Madrid). Auto-detected from destination coordinates.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Group</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-white/60">Adults</Label>
            <Stepper value={trip.adults || 0} onChange={(v) => update("adults", v)} min={0} max={20} />
          </div>
          <div>
            <Label className="text-white/60">Rooms</Label>
            <Stepper value={trip.rooms || 0} onChange={(v) => update("rooms", v)} min={0} max={10} />
          </div>
          <div>
            <Label className="text-white/60">Children</Label>
            <Stepper value={childrenAges.length} onChange={(v) => {
              const ages = [...childrenAges];
              while (ages.length < v) ages.push("");
              ages.length = v;
              update("children_ages", ages.join(","));
            }} min={0} max={10} />
          </div>
        </div>
        {childrenAges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {childrenAges.map((age, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Label className="text-white/40 text-xs">Child {i + 1}</Label>
                <Input type="number" min="0" max="17" value={age} placeholder="age" onChange={(e) => {
                  const ages = [...childrenAges];
                  ages[i] = e.target.value;
                  update("children_ages", ages.join(","));
                }} className="w-20 bg-white/5 border-white/10 text-white" />
              </div>
            ))}
          </div>
        )}
        <div>
          <Label className="text-white/60">Trip type</Label>
          <Select value={trip.trip_type || ""} onValueChange={(v) => update("trip_type", v)}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="couple">Couple</SelectItem>
              <SelectItem value="family">Family</SelectItem>
              <SelectItem value="friends">Friends</SelectItem>
              <SelectItem value="solo">Solo</SelectItem>
              <SelectItem value="business_leisure">Business + leisure</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Currency</h3>
        <div>
          <Label className="text-white/60">Trip currency</Label>
          <Select value={trip.currency || "EUR"} onValueChange={handleCurrencyChange}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {trip.exchange_rate && trip.exchange_rate !== 1 && (
            <p className="text-xs text-white/40 mt-1">
              Rate: 1 {trip.original_currency || "EUR"} = {trip.exchange_rate} {trip.currency}
              {trip.exchange_rate_updated_at && ` · Updated ${new Date(trip.exchange_rate_updated_at).toLocaleDateString("en-US", { day: "numeric", month: "short" })}`}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">Arrival & departure</h3>
        <p className="text-xs text-white/50">Optional details for airport, station or port transfers. Times below are local to the destination.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {['arrival', 'departure'].map(direction => <div key={direction} className="space-y-3">
            <DestinationAutocomplete dark purpose="place" keepSelection id={`${direction}-location`}
              label={`${direction === 'arrival' ? 'Arrival' : 'Departure'} airport / station / port`}
              value={trip[`${direction}_location`] || ''} destination={trip.destination || ''}
              latitude={trip.destination_latitude} longitude={trip.destination_longitude}
              kind={({ flight: 'airport', plane: 'airport', train: 'train', ship: 'ship', bus: 'bus' })[trip[`${direction}_mode`] || trip.travel_type] || ''}
              onChange={value => update(`${direction}_location`, value)}
              onSelect={place => update({ [`${direction}_location`]: place.name, ...Object.fromEntries(['place_id','address','city','country','lat','lng'].map(key => [`${direction}_${key}`, place[key]])) })} />
            <label className="block text-xs text-white/60">Local {direction} date and time<Input aria-label={`Local ${direction} date and time`} type="datetime-local" value={trip[`${direction}_datetime`] || ''} onChange={set(`${direction}_datetime`)} className="bg-white/5 border-white/10 text-white mt-1" /></label>
            <PrivateFileField label={`${direction === 'arrival' ? 'Arrival' : 'Departure'} ticket`} value={trip[`${direction}_ticket_url`]} onChange={url => update(`${direction}_ticket_url`, url)} />
          </div>)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-white/60">Arrival mode</Label>
            <Select value={trip.arrival_mode || ""} onValueChange={(v) => update("arrival_mode", v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flight">Flight</SelectItem>
                <SelectItem value="train">Train</SelectItem>
                <SelectItem value="ship">Ship</SelectItem>
                <SelectItem value="bus">Bus</SelectItem>
                <SelectItem value="car">Car</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-white/60">Departure mode</Label>
            <Select value={trip.departure_mode || ""} onValueChange={(v) => update("departure_mode", v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flight">Flight</SelectItem>
                <SelectItem value="train">Train</SelectItem>
                <SelectItem value="ship">Ship</SelectItem>
                <SelectItem value="bus">Bus</SelectItem>
                <SelectItem value="car">Car</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-white/40 bg-white/5 rounded-lg p-3">
          Flight details (airports, local times, timezones, booking status) are entered in the Transport section of the trip. Airport arrival is not the start of sightseeing time — we add time for disembarking, baggage, formalities, and transfer.
        </p>
      </section>
    </div>
  );
}
