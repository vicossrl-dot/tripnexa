import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';

export default function EditVisitDialog({ item, trip, version, onClose, onSaved }) {
  useLocale();
  const [draft, setDraft] = useState({ name: item.title, address: item.address || item.location || '', date: item.date, duration_min: item.duration_min || 60, start_time: item.locked ? item.start_time : '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    try { const result = await api.editItinerary(trip.id, { ...draft, duration_min: Number(draft.duration_min), item_id: item.id, expected_version: version }); onSaved(result); onClose(); }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto">
    <DialogTitle>{t("ui.edit.replace.visit.83db31a")}</DialogTitle><DialogDescription>{t("ui.change.the.place.or.day.only.the.affected.days.will.be.recalculat.4c94bae")}</DialogDescription>
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm">{t("ui.place.name.eed2561")}<Input aria-label={t("ui.visit.name.8ac34b9")} required maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="block text-sm">{t("ui.address.56ef8f2")}<Input aria-label={t("ui.visit.address.3320611")} maxLength={400} value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })} /></label>
      <label className="block text-sm">{t("ui.day.8f2364e")}<Input aria-label={t("ui.visit.day.bfa3e90")} type="date" required min={trip.start_date} max={trip.end_date} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      <label className="block text-sm">{t("ui.duration.minutes.279a3e5")}<Input aria-label={t("ui.visit.duration.40d89c8")} type="number" required min={15} max={480} value={draft.duration_min} onChange={event => setDraft({ ...draft, duration_min: event.target.value })} /></label>
      <label className="block text-sm">{t("ui.fixed.local.time.optional.d858c9c")}<Input aria-label={t("ui.visit.fixed.time.fb98c0a")} type="time" value={draft.start_time} onChange={event => setDraft({ ...draft, start_time: event.target.value })} /></label>
      <p className="text-xs text-neutral-500">{t("ui.leave.the.time.empty.for.automatic.placement.if.you.already.booke.d65c830")}</p>
      {error && <p role="alert" className="text-sm text-red-600">{translateText(error)}</p>}
      <Button disabled={saving} type="submit" className="bg-lime text-neutral-900">{saving ? t("ui.saving.23e3929") : t("ui.save.visit.5753254")}</Button>
    </form>
  </DialogContent></Dialog>;
}
