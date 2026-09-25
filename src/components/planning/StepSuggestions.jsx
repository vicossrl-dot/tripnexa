import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles } from 'lucide-react';
import { api } from '@/api/client';
import { useCapabilities } from '@/hooks/use-capabilities';
import { simulateSelection } from '@/lib/planningEngine';
import { samePlace } from '@/lib/place-matching';
import PlacePhotos from './PlacePhotos';

export default function StepSuggestions({ trip, dayWindows, places, onPlacesChange, beforeGenerate }) {
  const capabilities = useCapabilities();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [fits, setFits] = useState({});
  const [resolving,setResolving]=useState(null);
  const [locationChoice,setLocationChoice]=useState(null);
  const locations=useRef(new Map());
  const currentPlaces=useRef(places);currentPlaces.current=places;
  const controller = useRef(null);
  const started = useRef(false);
  const revision = useRef(0);

  async function generate() {
    const id = ++revision.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(''); setMessage('');
    try {
      await beforeGenerate(); // AI sees saved changes, including recent rejects/edits.
      if (id !== revision.current) return;
      const result = await api.ai.planningSuggestions(trip.id, abort.signal);
      if (id !== revision.current) return;
      const fresh=result.suggestions.map(item => ({ ...item, id: crypto.randomUUID() }));
      setSuggestions(fresh);
      // Resolve one at a time; keep partial provider failures isolated to their card.
      if(capabilities.places) for(const item of fresh){
        if(id!==revision.current)break;
        const promise=api.places.resolve({name:item.name,destination:trip.destination},abort.signal).catch(()=>({place:null,candidates:[]}));
        locations.current.set(item.id,promise);
        const found=await promise;
        if(id===revision.current&&found.place)setSuggestions(previous=>previous.map(row=>row.id===item.id?{...row,...found.place,category:row.category}:row));
      }
      setMessage(result.message); setEditing(null);
    } catch (failure) {
      if (id === revision.current && failure.name !== 'AbortError') setError(failure.message + ' Your saved places are unchanged. You can retry or continue without suggestions.');
    } finally { if (id === revision.current) setLoading(false); }
  }
  useEffect(() => {
    if (!capabilities.loading && capabilities.ai && !started.current) { started.current = true; generate(); }
  }, [capabilities.loading, capabilities.ai]);
  useEffect(() => () => { revision.current++; controller.current?.abort(); started.current = false; }, []);

  const saved = places.filter(place => place.selection_source === 'ai');
  const cards = [...saved, ...suggestions.filter(suggestion => !places.some(place => samePlace(place, suggestion)))];
  async function select(suggestion, priority, confirmedLocation = undefined) {
    setError('');
    if(priority!=='excluded'&&!suggestion.place_id&&confirmedLocation===undefined){
      setResolving(suggestion.id);
      try{
        const result=await (locations.current.get(suggestion.id) || (capabilities.places?api.places.resolve({name:suggestion.name,destination:trip.destination}):Promise.resolve({place:null,candidates:[]})));
        if(result.place)return await select({...suggestion,...result.place,category:suggestion.category},priority,true);
        setLocationChoice({suggestion,candidates:result.candidates || []});return;
      }catch{setLocationChoice({suggestion,candidates:[]});return;}finally{setResolving(null);}
    }
    const places=currentPlaces.current;
    const existing = places.find(place => place.id === suggestion.id);
    if (!existing && places.some(place => samePlace(place, suggestion))) {
      setError('This place is already in your list. Edit the existing entry in Desired places.'); return;
    }
    const locationFields={name:suggestion.name,address:suggestion.address||null,place_id:suggestion.place_id||null,lat:suggestion.lat??null,lng:suggestion.lng??null,city:suggestion.city||null,country:suggestion.country||null,status:suggestion.place_id?'resolved':'unresolved'};
    const place = existing ? { ...existing, ...locationFields, priority } : {
      id: suggestion.id, trip_id: trip.id, name: suggestion.name, address: suggestion.address || null,
      fit_reason: suggestion.fit_reason, category: suggestion.category, area: suggestion.area,
      best_time_of_day: suggestion.best_time_of_day || null,
      desired_duration_min: suggestion.visit_duration_min ?? 120, indoor_outdoor: suggestion.indoor_outdoor,
      place_id:suggestion.place_id || null,lat:suggestion.lat ?? null,lng:suggestion.lng ?? null,city:suggestion.city || null,country:suggestion.country || null,
      priority, selection_source: 'ai', status: suggestion.place_id?'resolved':'unresolved', ticket_type: null, ticket_purchased: false,
    };
    if (priority !== 'excluded') {
      const simulation = simulateSelection({ trip, dayWindows, currentPlaces: places.filter(item => item.id !== place.id), candidate: { place, add: true }, mealMin: trip.meal_duration_min ?? 60, bufferMin: trip.buffer_min ?? 15 });
      setFits(previous => ({ ...previous, [place.id]: simulation.feasible ? 'Estimated to fit; verify travel times and availability.' : 'May not fit the current schedule. Review it in Itinerary & tickets.' }));
    }
    const next=existing ? places.map(item => item.id === place.id ? place : item) : [...places, place];
    currentPlaces.current=next;onPlacesChange(next);setLocationChoice(null);
  }
  function saveEdit() {
    const name = draft.name.trim();
    if (!name || (draft.duration !== '' && (!Number.isInteger(Number(draft.duration)) || Number(draft.duration) < 15 || Number(draft.duration) > 480))) {
      setError('Enter a place name and a duration between 15 and 480 minutes, or leave duration blank.'); return;
    }
    const original=cards.find(item => item.id === editing);
    const locationChanged=name!==original.name||draft.address!==(original.address||'');
    const resetLocation=locationChanged?{place_id:null,lat:null,lng:null,city:null,country:null,status:'unresolved'}:{};
    const candidate = { ...original, ...resetLocation, name, address: draft.address, aliases: [] };
    if (places.some(item => item.id !== editing && samePlace(item, candidate)) || suggestions.some(item => item.id !== editing && samePlace(item, candidate))) {
      setError('This place is already selected or suggested. Choose a different place.'); return;
    }
    if(locationChanged)locations.current.delete(editing);
    const existing = places.find(item => item.id === editing);
    if (existing) onPlacesChange(places.map(item => item.id === editing ? { ...item, ...resetLocation, name, address: draft.address, desired_duration_min: draft.duration === '' ? null : Number(draft.duration) } : item));
    else setSuggestions(previous => previous.map(item => item.id === editing ? { ...candidate, visit_duration_min: draft.duration === '' ? null : Number(draft.duration) } : item));
    setEditing(null); setError('');
  }
  return <div className="space-y-4">
    <div className="bg-lime/10 border border-lime/30 rounded-xl p-4">
      <p className="text-sm text-white/90"><Sparkles className="w-4 h-4 inline text-lime mr-1.5" /> Additional activities for your plan</p>
      <p className="mt-2 text-xs text-white/60">Suggestions use your destination, dates, stays, preferences and available time. Accept the ones you want; rejected places will be excluded from future requests.</p>
    </div>
    {!capabilities.loading && !capabilities.ai && <p className="text-sm text-white/60">AI suggestions are unavailable. You can add places manually in Desired places and continue planning.</p>}
    {capabilities.ai && <Button disabled={loading || editing !== null} onClick={generate} className="bg-lime text-neutral-900 hover:brightness-105">
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{loading ? 'Finding matching places…' : 'Generate suggestions'}
    </Button>}
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    {message && <p role="status" className="text-xs text-white/60">{message}</p>}
    <div className="space-y-3">
      {cards.map(suggestion => {
        const persisted = saved.some(item => item.id === suggestion.id);
        const rejected = persisted && suggestion.priority === 'excluded';
        const duration = persisted ? suggestion.desired_duration_min : suggestion.visit_duration_min;
        return <article key={suggestion.id} data-suggestion-card className={`rounded-xl border p-4 space-y-3 ${persisted && !rejected ? 'border-lime bg-lime/5' : 'border-white/10 bg-white/5'}`}>
          <div className="flex justify-between gap-3"><h3 className="text-white font-semibold">{suggestion.name}</h3><span className="text-xs text-white/60">{persisted ? rejected ? 'Rejected' : 'Accepted' : 'Suggested'}</span></div>
          <p className="text-sm text-white/60">{suggestion.fit_reason}</p>
          <p className="text-xs text-white/50">{[suggestion.category?.replaceAll('_', ' '), suggestion.area, duration ? `About ${duration} min` : '', suggestion.best_time_of_day].filter(Boolean).join(' · ')}</p>
          {suggestion.address && <p className="text-xs text-white/50">{suggestion.address}</p>}
          {suggestion.place_id&&<PlacePhotos placeId={suggestion.place_id} name={suggestion.name}/>}
          {locationChoice?.suggestion.id===suggestion.id&&<div className="rounded-lg border border-amber-300/30 p-3 space-y-2"><p className="text-sm text-amber-100">Confirm the location before accepting this place.</p>{locationChoice.candidates.map(candidate=><button key={candidate.place_id} className="block text-left w-full p-2 rounded hover:bg-white/10 text-sm" onClick={()=>select({...suggestion,...candidate,category:suggestion.category},'preferred',true)}>{candidate.name} · {candidate.address}</button>)}<button className="text-sm text-lime underline" onClick={()=>select(suggestion,'preferred',true)}>Keep as a manual place — I will verify its location</button></div>}
          {editing === suggestion.id ? <div className="space-y-2">
            <label className="block text-xs text-white/60">Place name<Input aria-label="Edit suggestion name" value={draft.name} maxLength={200} onChange={event => setDraft({ ...draft, name: event.target.value })} className="bg-white/5 text-white border-white/10" /></label>
            <label className="block text-xs text-white/60">Address<Input aria-label="Edit suggestion address" value={draft.address} maxLength={400} onChange={event => setDraft({ ...draft, address: event.target.value })} className="bg-white/5 text-white border-white/10" /></label>
            <label className="block text-xs text-white/60">Estimated duration (minutes)<Input aria-label="Edit suggestion duration" type="number" min={15} max={480} value={draft.duration} onChange={event => setDraft({ ...draft, duration: event.target.value })} className="bg-white/5 text-white border-white/10" /></label>
            <Button onClick={saveEdit} className="bg-lime text-neutral-900">Save edits</Button><button onClick={() => setEditing(null)} className="ml-4 text-sm text-white/70">Cancel</button>
          </div> : <div className="flex flex-wrap gap-3">
            {(!persisted || rejected) && <Button disabled={loading || resolving!==null} onClick={() => select(suggestion, 'preferred')} className="bg-lime text-neutral-900">{resolving===suggestion.id?'Resolving location…':'Accept'}</Button>}
            {!rejected && <button disabled={loading} onClick={() => select(suggestion, 'excluded')} className="text-sm text-white/70 disabled:opacity-40">Reject</button>}
            <button disabled={loading} onClick={() => { setEditing(suggestion.id); setDraft({ name: suggestion.name, address: suggestion.address || '', duration: duration == null ? '' : String(duration) }); }} className="text-sm text-white/70 disabled:opacity-40">Edit</button>
          </div>}
          {persisted&&!rejected&&!suggestion.place_id&&<button className="text-sm text-lime underline" disabled={resolving!==null} onClick={()=>select(suggestion,'preferred')}>Confirm location</button>}
          {persisted && !rejected && fits[suggestion.id] && <p className="text-xs text-lime">{fits[suggestion.id]}</p>}
          {persisted && !rejected && <p className="text-xs text-white/40">Ticket requirements are unverified. Review this place in Desired places.</p>}
        </article>;
      })}
    </div>
  </div>;
}
