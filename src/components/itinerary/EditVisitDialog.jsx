import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';

export default function EditVisitDialog({ item, trip, version, onClose, onSaved }) {
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
    <DialogTitle>Edit / replace visit</DialogTitle><DialogDescription>Change the place or day. Only the affected days will be recalculated. Replacing a place clears its old ticket and location metadata.</DialogDescription>
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm">Place name<Input aria-label="Visit name" required maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="block text-sm">Address<Input aria-label="Visit address" maxLength={400} value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })} /></label>
      <label className="block text-sm">Day<Input aria-label="Visit day" type="date" required min={trip.start_date} max={trip.end_date} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      <label className="block text-sm">Duration (minutes)<Input aria-label="Visit duration" type="number" required min={15} max={480} value={draft.duration_min} onChange={event => setDraft({ ...draft, duration_min: event.target.value })} /></label>
      <label className="block text-sm">Fixed local time (optional)<Input aria-label="Visit fixed time" type="time" value={draft.start_time} onChange={event => setDraft({ ...draft, start_time: event.target.value })} /></label>
      <p className="text-xs text-neutral-500">Leave the time empty for automatic placement. If you already booked a ticket, confirm the changed date/time with the provider.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button disabled={saving} type="submit" className="bg-lime text-neutral-900">{saving ? 'Saving…' : 'Save visit'}</Button>
    </form>
  </DialogContent></Dialog>;
}
