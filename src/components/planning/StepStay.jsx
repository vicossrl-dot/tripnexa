import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
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
import FieldHelper from '@/components/ui/field-helper';

export default function StepStay({ tripId, trip, update, stays, onStayChange }) {
  useLocale();
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
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider">{t("ui.have.you.booked.your.stay.055a2a7")}</h3>
        <div className="grid grid-cols-1 gap-2">
          {[
            { key: "booked", label: "Yes, I've booked", desc: "I have the confirmation" },
            { key: "chosen", label: "I've chosen, not booked yet", desc: "Using it as a reference" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => pickStatus(opt.key)}
              className={`text-left rounded-xl border p-4 transition-all ${status === opt.key ? "border-lime bg-lime/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}
            >
              <div className="flex items-center gap-2">
                {status === opt.key ? <CheckCircle2 className="w-4 h-4 text-lime" /> : <div className="w-4 h-4 rounded-full border border-white/30" />}
                <span className="font-semibold text-white">{translateText(opt.label)}</span>
              </div>
              <p className="text-xs text-white/40 mt-1 ml-6">{translateText(opt.desc)}</p>
            </button>
          ))}
        </div>
      </div>

      {(status === "booked" || status === "chosen") && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider flex items-center gap-2"><Bed className="w-4 h-4 text-lime" />{" "}{t("ui.stay.details.2e24e1c")}</h3>
          <div>
            <Label className="text-white/60">{t("ui.import.from.link.e89ae4f")}</Label>
            <div className="flex gap-2">
              <Input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://booking.com/…" className="bg-white/5 border-white/10 text-white" />
              <Button onClick={handleImport} disabled={importing || !importUrl.trim()} className="bg-lime text-neutral-900 hover:brightness-105 shrink-0">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : t("ui.read.9b9a8d0")}
              </Button>
            </div>
            {importError && <p className="text-xs text-red-400 mt-1">{importError}</p>}
            <FieldHelper icon={Bed}>{t("ui.save.time.paste.your.hotel.link.and.select.read.to.find.available.06f66cf")}</FieldHelper>
          </div>
          <PrivateFileField tripId={tripId} label={t("ui.reservation.pdf.image.cfea0ed")} helper={capabilities.ai ? t("ui.add.it.once.upload.your.confirmation.then.select.extract.reservat.cb1a889") : t("ui.keep.your.confirmation.here.for.easy.access.to.your.booking.detai.ec68226")} value={stay?.reservation_file_url} onChange={url => { saveStay({ reservation_file_url: url }); setPreview(null); }} />
          {stay?.reservation_file_url && <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white" disabled={!capabilities.ai || importing} onClick={() => extract({ file_url: stay.reservation_file_url })}>{importing ? t("ui.reading.reservation.1b84e32") : t("ui.extract.reservation.details.5531116")}</Button>}
          <p className="text-xs text-white/40">{t("ui.extracting.a.file.sends.it.securely.from.the.backend.to.the.confi.d7b9ba4")}</p>
          {preview && <div role="region" aria-label={t("ui.hotel.import.preview.eeadc7d")} className="rounded-xl border border-lime/40 bg-lime/5 p-4 space-y-3">
            <h4 className="text-white font-semibold">{t("ui.review.hotel.details.before.saving.ff75792")}</h4>
            {preview.warnings.map((warning, i) => <p key={i} className="text-xs text-amber-200">{translateText(warning)}</p>)}
            <div className="grid sm:grid-cols-2 gap-3">{[["title","Hotel name"],["address","Address"],["city","City"],["country","Country"],["date","Check-in date"],['end_date',"Check-out date"],['check_in_time',"Check-in time"],['check_out_time',"Check-out time"],['confirmation_number',"Confirmation / reference"]].map(([key,label]) => <label key={key} className="text-xs text-white/60">{translateText(label)}<Input aria-label={t("ui.preview.4b55d10") + label} type={['date','end_date'].includes(key) ? 'date' : key.endsWith('_time') ? 'time' : 'text'} value={preview.data[key] || ''} onChange={event => setPreview({ ...preview, data: { ...preview.data, [key]: event.target.value } })} className="bg-white/5 border-white/10 text-white" /></label>)}</div>
            <div className="flex flex-wrap gap-3"><Button disabled={!preview.data.title?.trim() || !preview.data.address?.trim()} onClick={confirmPreview} className="bg-lime text-neutral-900">{t("ui.confirm.hotel.details.8141c46")}</Button><Button variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white" onClick={() => setPreview(null)}>{t("ui.discard.preview.b78cf0d")}</Button></div>
          </div>}
          <DestinationAutocomplete purpose="place" keepSelection id="stay-hotel" label={t("ui.hotel.name.258d8d6")} kind="hotel" destination={trip.destination || ''} latitude={trip.destination_latitude} longitude={trip.destination_longitude} value={stay?.title === 'Accommodation' ? '' : stay?.title || ''} onChange={value => manualHotel('title', value)} onSelect={selectHotel} />
          <DestinationAutocomplete purpose="place" keepSelection addressField id="stay-address" label={t("ui.exact.address.f4338ff")} destination={trip.destination || ''} latitude={trip.destination_latitude} longitude={trip.destination_longitude} value={stay?.address || ''} onChange={value => manualHotel('address', value)} onSelect={place => { if (place.category === 'street_address' || place.category === 'premise' || !place.category) saveStay({ address: place.address, city: place.city, country: place.country, lat: place.lat, lng: place.lng, place_id: place.place_id, source_status: 'api_provided', verified_at: null }); else selectHotel(place); }} />
          <div className="grid grid-cols-2 gap-3"><div><Label className="text-white/60">{t("ui.city.fc33f73")}</Label><Input aria-label={t("ui.city.fc33f73")} {...field("city")} className="bg-white/5 border-white/10 text-white" /></div><div><Label className="text-white/60">{t("ui.country.701d021")}</Label><Input aria-label={t("ui.country.701d021")} {...field("country")} className="bg-white/5 border-white/10 text-white" /></div></div>
          <div><Label className="text-white/60">{t("ui.confirmation.reference.3315bc2")}</Label><Input aria-label={t("ui.confirmation.reference.3315bc2")} {...field('confirmation_number')} className="bg-white/5 border-white/10 text-white" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-white/60">{t('pdf.checkin')}</Label><Input aria-label={t('pdf.checkin')} type="date" {...field("date")} className="bg-white/5 border-white/10 text-white" /></div>
            <div><Label className="text-white/60">{t('pdf.checkout')}</Label><Input aria-label={t('pdf.checkout')} type="date" {...field("end_date")} className="bg-white/5 border-white/10 text-white" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-white/60">{t("ui.check.in.time.434a931")}</Label><Input aria-label={t("ui.check.in.time.434a931")} type="time" {...field("check_in_time")} className="bg-white/5 border-white/10 text-white" /></div>
            <div><Label className="text-white/60">{t("ui.check.out.time.2236a05")}</Label><Input aria-label={t("ui.check.out.time.2236a05")} type="time" {...field("check_out_time")} className="bg-white/5 border-white/10 text-white" /></div>
          </div>
          {status === "chosen" && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">{t("ui.unconfirmed.stay.used.as.a.reference.but.we.don.t.assume.early.ch.dbe3377")}</p>
            </div>
          )}
          <p className="text-xs text-white/40">{t("ui.this.address.is.used.as.the.start.and.end.point.for.each.day.s.it.d12c723")}</p>
        </section>
      )}

      {status === "none" && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider flex items-center gap-2"><Calculator className="w-4 h-4 text-lime" />{" "}{t("ui.accommodation.budget.eecc05f")}</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white/60">{t("ui.budget.type.87cd1d6")}</Label>
              <Select
                value={budgetMode}
                onValueChange={(v) => update("budget_accommodation_mode", v)}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">{t("ui.total.for.stay.bb0a0e6")}</SelectItem>
                  <SelectItem value="per_person">{t("ui.per.person.6c6874d")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/60">{t("ui.amount.9eb2e87")}{currency})</Label>
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
                <span className="text-white/60">{t("ui.people.included.e1f2c71")}</span>
                <span className="text-white font-semibold">{totalPeople} ({trip.adults || 0}{" "}{t("ui.adults.3a7a376")}{childrenAges.length > 0 ? t("ui.value.children.f3c9a70", {v0: childrenAges.length}) : ""})</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">{t("ui.nights.25938d1")}</span>
                <span className="text-white font-semibold">{nights || "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">{t("ui.rooms.bd32f6c")}</span>
                <span className="text-white font-semibold">{trip.rooms || 1}</span>
              </div>
              <div className="border-t border-lime/20 pt-2 mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-white/80 font-medium">{t("ui.total.budget.7f4ba95")}</span>
                  <span className="text-lime font-bold text-lg">{formatCurrency(totalBudget, currency)}</span>
                </div>
                {nights > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">{t("ui.avg.per.night.all.rooms.e4964d7")}</span>
                    <span className="text-white font-semibold">{formatCurrency(Math.round(perNight), currency)}</span>
                  </div>
                )}
              </div>
              {budgetMode === "per_person" && (
                <p className="text-xs text-white/40 pt-1">
                  {formatCurrency(budgetAmount, currency)} × {totalPeople}{" "}{t("ui.people.c8a78fa")}{" "}{formatCurrency(totalBudget, currency)}{" "}{t("ui.for.the.entire.stay.0fb20f3")}</p>
              )}
            </div>
          )}

          <div>
            <Label className="text-white/60">{t("ui.important.preferences.efc439e")}</Label>
            <Textarea aria-label={t("ui.important.preferences.efc439e")}
              placeholder={t("ui.breakfast.parking.cancellation.accessibility.quiet.area.near.tran.d2d4fd2")}
              className="bg-white/5 border-white/10 text-white"
              value={trip.interests || ""}
              onChange={(e) => update("interests", e.target.value)}
            />
          </div>
          <div><Label className="text-white/60">{t("ui.place.that.determines.the.area.optional.73115e3")}</Label><Input aria-label={t("ui.place.that.determines.the.area.optional.73115e3")} placeholder={t("ui.e.g.a.theme.park.e1fdbc5")} className="bg-white/5 border-white/10 text-white" /></div>

          <div className="bg-white/5 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-white/80">{t("ui.suggested.areas.d70b6e3")}</p>
            <p className="text-xs text-white/40">{t("ui.without.an.approved.hotel.api.we.recommend.areas.and.offer.search.77c1a13")}</p>
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">{t("ui.search.hotels.affiliate.link.ab5f051")}</Button>
          </div>
        </section>
      )}
    </div>
  );
}
