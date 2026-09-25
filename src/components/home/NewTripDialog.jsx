import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/api/client";
import { Sparkles, Loader2 } from "lucide-react";
import PlaneTakeoff from "./PlaneTakeoff";
import DestinationAutocomplete from './DestinationAutocomplete';
import TravelTypeField from '@/components/trip/TravelTypeField';

export default function NewTripDialog({ open, onClose }) {
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [details, setDetails] = useState({});
  const [travelType, setTravelType] = useState('');
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [nameMessage, setNameMessage] = useState('');
  const generation = useRef(0);
  const activeRequest = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    generation.current++;
    activeRequest.current = null;
    if (open) {
      setName(''); setDestination(''); setDetails({}); setTravelType('');
      setSuggestions([]); setNameMessage(''); setResolving(false); setSuggesting(false);
    }
  }, [open]);
  function invalidateNames() { generation.current++; setSuggestions([]); setNameMessage(''); }
  const handleSuggest = async () => {
    if (!destination.trim()) return;
    const revision = ++generation.current;
    activeRequest.current = revision;
    setSuggesting(true); setNameMessage('');
    try {
      const result = await api.ai.tripNames({ destination, travel_type: travelType || null });
      if (revision === generation.current) {
        setSuggestions(result.names); setName(result.names[0]);
        setNameMessage(result.source === 'ai' ? 'Three ideas for your trip. Pick one or edit it below.' : result.message);
      }
    } catch {
      if (revision === generation.current) setNameMessage('Could not suggest names right now. Please enter your own trip name.');
    } finally { if (activeRequest.current === revision) { activeRequest.current = null; setSuggesting(false); } }
  };
  const handleCreate = async () => {
    if (!name.trim() || resolving || saving) return;
    setSaving(true);
    try {
      const trip = await api.entities.Trip.create({ ...details, name: name.trim(), destination: destination.trim(), travel_type: travelType || null });
      onClose(); navigate(`/trip/${trip.id}`);
    } catch { /* The shared API handler displays save errors. */ }
    finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={value => !value && !saving && onClose()}>
    <DialogContent className="w-[calc(100%-30px)] max-w-[calc(100%-30px)] sm:max-w-md rounded-xl max-h-[90dvh] overflow-y-auto">
      <PlaneTakeoff />
      <DialogHeader className="space-y-1">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-neutral-400">Boarding soon</p>
        <DialogTitle className="font-heading font-black tracking-[-0.03em] text-3xl text-neutral-900">Where to next?</DialogTitle>
        <DialogDescription>Every great story starts with a ticket.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <DestinationAutocomplete value={destination} onBusy={setResolving}
          onChange={value => { setDestination(value); setDetails({}); invalidateNames(); }}
          onSelect={value => { setDestination(value.destination); setDetails(value); invalidateNames(); }} />
        <TravelTypeField value={travelType} onChange={value => { setTravelType(value); invalidateNames(); }} />
        <div className="space-y-1.5">
          <Label htmlFor="trip-name" className="font-mono text-[11px] uppercase tracking-[0.15em] text-neutral-500">Trip name *</Label>
          <Input id="trip-name" value={name} maxLength={120} onChange={event => { generation.current++; setName(event.target.value); }} placeholder="e.g. Tokyo Adventure" className="h-11 rounded-xl" />
          <button type="button" onClick={handleSuggest} disabled={suggesting || resolving || !destination.trim()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-[13px] font-semibold text-neutral-900 shadow-sm hover:shadow-md disabled:opacity-50 transition-all">
            {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {suggesting ? 'Thinking of three names…' : 'Surprise me with a spicy name'}
          </button>
          {nameMessage && <p role="status" className="text-xs text-neutral-500 pt-1">{nameMessage}</p>}
          {suggestions.length > 0 && <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Trip name suggestions">
            {suggestions.map(suggestion => <button key={suggestion} type="button" aria-pressed={name === suggestion} onClick={() => { generation.current++; setName(suggestion); }}
              className={`rounded-full border px-3 py-1.5 text-sm ${name === suggestion ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-200 hover:bg-neutral-100'}`}>{suggestion}</button>)}
          </div>}
        </div>
      </div>
      <Button onClick={handleCreate} disabled={saving || resolving || suggesting || !name.trim()} className="w-full h-12 rounded-xl bg-neutral-900 text-white hover:bg-neutral-700 text-base font-bold">
        {saving ? 'Creating…' : "Let's go ✈"}
      </Button>
    </DialogContent>
  </Dialog>;
}
