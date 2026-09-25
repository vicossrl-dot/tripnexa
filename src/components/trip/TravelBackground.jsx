import { travelBackground } from '@/lib/travel-types';

export default function TravelBackground({ type }) {
  return <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true" data-travel-background={type || 'default'}>
    <img src={travelBackground(type)} alt="" className="h-full w-full object-cover blur-[8px] scale-110 opacity-70" />
    <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/70" />
  </div>;
}
