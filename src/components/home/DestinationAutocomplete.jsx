import { useEffect, useRef, useState, useId } from 'react';
import { Input } from '@/components/ui/input';
import { api } from '@/api/client';
import { useCapabilities } from '@/hooks/use-capabilities';

export default function DestinationAutocomplete({ value, onChange, onSelect, onBusy = (_busy) => {}, purpose = 'destination', latitude = null, longitude = null, id = '', label = '', dark = false, light = false, kind = '', destination = '', keepSelection = false, addressField = false }) {
  const isPlace = purpose === 'place';
  const inputId = id || (isPlace ? 'desired-place-search' : 'trip-destination');
  const darkStyle = !light && (dark || isPlace);
  const { places, loading: configuring, error: configError } = useCapabilities();
  const [suggestions, setSuggestions] = useState([]);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const session = useRef(crypto.randomUUID());
  const selectedText = useRef('');
  const revision = useRef(0);
  const detailsController = useRef(null);
  const listId = useId();
  useEffect(() => () => { revision.current++; detailsController.current?.abort(); }, []);
  useEffect(() => {
    setSuggestions([]); setActive(-1);
    if (!places || !focused || value.trim().length < 2 || value === selectedText.current) { setSearching(false); return; }
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(async () => {
      setSearching(true); setMessage('');
      try {
        const bias = Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : undefined;
        const result = await api.places.autocomplete({ input: value, sessionToken: session.current, bias, kind, destination }, controller.signal);
        if (current) { setSuggestions(result.suggestions); if (!result.suggestions.length) setMessage('No suggestions found. You can use the destination you typed.'); }
      } catch (error) { if (current && error.name !== 'AbortError') setMessage(error.message + ' Manual entry is still available.'); }
      finally { if (current) setSearching(false); }
    }, 300);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [value, places, focused, latitude, longitude, kind, destination]);

  async function choose(suggestion) {
    const requestRevision = ++revision.current;
    setResolving(true); onBusy(true); setSuggestions([]); setFocused(false); setMessage('');
    detailsController.current?.abort();
    const controller = new AbortController(); detailsController.current = controller;
    try {
      const details = await api.places.details({ placeId: suggestion.place_id, sessionToken: session.current, purpose }, controller.signal);
      if (requestRevision === revision.current) {
        selectedText.current = isPlace ? (keepSelection ? (addressField ? details.address : details.name) : '') : details.destination;
        onSelect(details);
        setMessage(isPlace ? (keepSelection ? 'Place selected. You can also edit it manually.' : 'Place selected. Search again to add another.') : details.timezone ? 'Destination and timezone selected.' : 'Destination selected. You can set the timezone during planning.');
      }
    } catch (error) {
      if (requestRevision === revision.current && error.name !== 'AbortError') setMessage(error.message + ' Keep typing to enter it manually.');
    } finally {
      if (requestRevision === revision.current) { session.current = crypto.randomUUID(); setResolving(false); onBusy(false); }
    }
  }
  const expanded = focused && suggestions.length > 0;
  return <div className="relative space-y-1.5">
    <label htmlFor={inputId} className={darkStyle ? 'text-sm text-white/60' : 'font-mono text-[11px] uppercase tracking-[0.15em] text-neutral-500'}>{label || (isPlace ? 'Search a desired place' : 'Destination')}</label>
    <Input id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
      aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
      aria-describedby={`${listId}-status`} autoComplete="off" maxLength={200} value={value}
      placeholder={isPlace ? 'Search by name or address' : 'e.g. Japan · Tokyo · Kyoto'} className={darkStyle ? 'h-11 bg-white/5 border-white/10 text-white' : 'h-11 rounded-xl'} onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={event => {
        revision.current++; detailsController.current?.abort(); selectedText.current = '';
        setResolving(false); onBusy(false); setMessage(''); setFocused(true); onChange(event.target.value);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setFocused(false); }
        if (!expanded) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(previous => (previous + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length); }
        if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(suggestions[active]); }
      }} />
    {expanded && <div className="absolute top-full inset-x-0 z-50 rounded-xl border bg-white shadow-xl overflow-hidden">
      <ul id={listId} role="listbox" aria-label={isPlace ? 'Place suggestions' : 'Destination suggestions'}>
        {suggestions.map((item, index) => <li key={item.place_id} id={`${listId}-${index}`} role="option" aria-selected={index === active}
          className={`px-3 py-2.5 text-sm text-neutral-900 cursor-pointer ${index === active ? 'bg-lime/30' : 'hover:bg-neutral-100'}`}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>{item.description}</li>)}
      </ul>
      <div className="border-t px-3 py-2 text-xs font-normal text-[#5e5e5e] whitespace-nowrap" translate="no">Google Maps</div>
    </div>}
    <p id={`${listId}-status`} role="status" className={darkStyle ? 'text-xs text-white/50' : 'text-xs text-neutral-500'}>
      {resolving ? 'Loading place details…' : searching ? 'Searching places…' : (isPlace ? message.replaceAll('destination', 'place') : message) || configError || (!configuring && !places ? 'Suggestions are not configured. Manual entry is available.' : (isPlace ? 'Choose a Google suggestion or type the place manually.' : 'Choose a suggestion or enter your destination manually.'))}
    </p>
    {selectedText.current && <p className="text-xs font-normal text-[#5e5e5e] whitespace-nowrap" translate="no">Google Maps</p>}
  </div>;
}
