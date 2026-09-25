import { TRAVEL_TYPES } from '@/lib/travel-types';

export default function TravelTypeField({ value, onChange, dark = false }) {
  return <div className="space-y-1.5">
    <label htmlFor="travel-type" className={`text-sm font-medium ${dark ? 'text-white/60' : 'text-neutral-600'}`}>How are you traveling?</label>
    <select id="travel-type" value={value || ''} onChange={event => onChange(event.target.value)}
      className={`w-full h-11 rounded-xl border px-3 text-sm ${dark ? 'bg-neutral-900 border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-900'}`}>
      <option value="">Select travel type (optional)</option>
      {TRAVEL_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
    </select>
  </div>;
}
