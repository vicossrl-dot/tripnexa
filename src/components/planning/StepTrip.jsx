import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Stepper from "@/components/ui/stepper";
import TravelTypeField from '@/components/trip/TravelTypeField';
import DestinationAutocomplete from '@/components/home/DestinationAutocomplete';
import PrivateFileField from './PrivateFileField';

export default function StepTrip({ trip, update }) {
  useLocale();
  const set = (k) => (e) => update(k, e.target.value);
  const childrenAges = (trip.children_ages || "").split(",").filter(Boolean);
  const nights = (() => {
    if (!trip.start_date || !trip.end_date) return 0;
    const s = new Date(trip.start_date + "T00:00:00");
    const e = new Date(trip.end_date + "T00:00:00");
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
  })();


  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">{t("ui.destination.time.f1f4631")}</h3>
        <TravelTypeField dark value={trip.travel_type} onChange={value => update('travel_type', value || null)} />
        <div className="grid grid-cols-2 gap-3">
          <DestinationAutocomplete dark id="planner-destination" label={t("ui.exact.destination.bdc2635")} value={trip.destination || ''} onChange={value => update('destination', value)} onSelect={details => update(details)} />
          <div><Label className="text-white/60">{t("ui.country.701d021")}</Label><Input aria-label={t("ui.country.701d021")} value={trip.country || ""} onChange={set("country")} placeholder={t("ui.spain.8ef41e6")} className="bg-white/5 border-white/10 text-white" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-white/60">{t("ui.arrival.794adbb")}</Label><Input aria-label={t("ui.arrival.794adbb")} type="date" value={trip.start_date || ""} onChange={set("start_date")} className="bg-white/5 border-white/10 text-white" /></div>
          <div><Label className="text-white/60">{t("ui.departure.8356983")}</Label><Input aria-label={t("ui.departure.8356983")} type="date" value={trip.end_date || ""} onChange={set("end_date")} className="bg-white/5 border-white/10 text-white" /></div>
        </div>
        {trip.start_date && trip.end_date && trip.end_date < trip.start_date && (
          <p className="text-xs text-red-400">{t("ui.departure.must.be.on.or.after.arrival.991bfba")}</p>
        )}
        {nights > 0 && <p className="text-xs text-white/40">{nights} {nights === 1 ? t("ui.night.176473d") : t("ui.nights.de5c905")}</p>}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">{t("ui.group.34ca0e7")}</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-white/60">{t("ui.adults.c8a7592")}</Label>
            <Stepper label={t("ui.adults.c8a7592")} value={trip.adults || 0} onChange={(v) => update("adults", v)} min={0} max={20} />
          </div>
          <div>
            <Label className="text-white/60">{t("ui.rooms.bd32f6c")}</Label>
            <Stepper label={t("ui.rooms.bd32f6c")} value={trip.rooms || 0} onChange={(v) => update("rooms", v)} min={0} max={10} />
          </div>
          <div>
            <Label className="text-white/60">{t("ui.children.3583a35")}</Label>
            <Stepper label={t("ui.children.3583a35")} value={childrenAges.length} onChange={(v) => {
              const ages = [...childrenAges];
              while (ages.length < v) ages.push("0");
              ages.length = v;
              update("children_ages", ages.join(","));
            }} min={0} max={10} />
          </div>
        </div>
        {childrenAges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {childrenAges.map((age, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Label className="text-white/40 text-xs">{t("ui.child.8053321")}{" "}{i + 1}</Label>
                <Input aria-label={t("ui.child.value.age.b29a5b1", {v0: i + 1})} type="number" min="0" max="17" value={age} placeholder={t("ui.age.013f544")} onChange={(e) => {
                  const ages = [...childrenAges];
                  ages[i] = String(Math.max(0, Math.min(17, Number(e.target.value) || 0)));
                  update("children_ages", ages.join(","));
                }} className="w-20 bg-white/5 border-white/10 text-white" />
              </div>
            ))}
          </div>
        )}
        <div>
          <Label className="text-white/60">{t("ui.trip.type.afe82b7")}</Label>
          <Select value={trip.trip_type || ""} onValueChange={(v) => update("trip_type", v)}>
            <SelectTrigger aria-label={t("ui.trip.type.afe82b7")} className="bg-white/5 border-white/10 text-white"><SelectValue placeholder={t("ui.select.731fe04")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="couple">{t("ui.couple.8a8d867")}</SelectItem>
              <SelectItem value="family">{t("ui.family.bd2d677")}</SelectItem>
              <SelectItem value="friends">{t("ui.friends.bd104d1")}</SelectItem>
              <SelectItem value="solo">{t("ui.solo.a6db480")}</SelectItem>
              <SelectItem value="business_leisure">{t("ui.business.leisure.4ff9f16")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>



      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">{t("ui.arrival.departure.2bb9081")}</h3>
        <p className="text-xs text-white/50">{t("ui.optional.details.for.airport.station.or.port.transfers.times.belo.e358389")}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {["arrival", "departure"].map(direction => <div key={direction} className="space-y-3">
            <DestinationAutocomplete dark purpose="place" keepSelection id={`${direction}-location`}
              label={t("ui.value.airport.station.port.7cefb58", {v0: direction === 'arrival' ? 'Arrival' : 'Departure'})}
              value={trip[`${direction}_location`] || ''} destination={trip.destination || ''}
              latitude={trip.destination_latitude} longitude={trip.destination_longitude}
              kind={({ flight: 'airport', plane: 'airport', train: 'train', ship: 'ship', bus: 'bus' })[trip[`${direction}_mode`] || trip.travel_type] || ''}
              onChange={value => update(`${direction}_location`, value)}
              onSelect={place => update({ [`${direction}_location`]: place.name, ...Object.fromEntries(['place_id','address','city','country','lat','lng'].map(key => [`${direction}_${key}`, place[key]])) })} />
            <label className="block text-xs text-white/60">{t("ui.local.8c31e6e")}{" "}{translateText(direction)}{" "}{t("ui.date.and.time.4b37cd5")}<Input aria-label={t("ui.local.value.date.and.time.ea7d031", {v0: direction})} type="datetime-local" value={trip[`${direction}_datetime`] || ''} onChange={set(`${direction}_datetime`)} className="bg-white/5 border-white/10 text-white mt-1" /></label>
            <PrivateFileField tripId={trip.id} label={t("ui.value.ticket.b397055", {v0: direction === 'arrival' ? 'Arrival' : 'Departure'})} value={trip[`${direction}_ticket_url`]} onChange={url => update(`${direction}_ticket_url`, url)} />
          </div>)}
        </div>
        <p className="text-xs text-white/40 bg-white/5 rounded-lg p-3">{t("ui.flight.details.airports.local.times.timezones.booking.status.are.be8a74f")}</p>
      </section>
    </div>
  );
}
