import { Link } from 'react-router-dom';
import { Compass, ArrowRight } from 'lucide-react';

export default function PlanTripCard({ tripId }) {
  return <Link to={`/trip/${tripId}/plan`} data-plan-trip-card className="w-full sm:w-72 min-h-52 rounded-xl border-2 border-dashed border-white/30 bg-neutral-950/80 flex flex-col items-center justify-center gap-3 p-6 text-white/80 hover:border-lime hover:text-white transition-colors group">
    <span className="w-12 h-12 rounded-full bg-lime flex items-center justify-center group-hover:scale-110 transition-transform"><Compass className="w-5 h-5 text-neutral-900" /></span>
    <span className="font-heading font-bold tracking-tight">Plan your trip</span>
    <span className="text-xs text-white/60 text-center">Set your dates, choose your stay and build your itinerary.</span>
    <span className="inline-flex items-center gap-1 text-xs text-lime">Start planning <ArrowRight className="w-3 h-3" /></span>
  </Link>;
}
