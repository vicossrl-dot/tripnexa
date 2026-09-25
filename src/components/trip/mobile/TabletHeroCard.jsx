import React from "react";
import { MapPin, Plane } from "lucide-react";
import { format, parseISO } from "date-fns";
import TripCountdown from "@/components/trip/TripCountdown";

// Tablet-only: the desktop boarding-pass card (minus the photo), floating
// centered over the hero image carousel.
export default function TabletHeroCard({ trip, start, end, count, index }) {
  return (
    <div className="absolute inset-0 z-20 hidden md:flex items-center justify-center p-8 pointer-events-none">
      <div className="bg-white rounded-xl p-6 sm:p-8 shadow-2xl w-[480px] max-w-full text-left">
        <p className="text-[13px] font-mono font-medium uppercase tracking-[0.3em] text-neutral-600">Trip</p>
        <h2 className="mt-1.5 font-heading font-medium tracking-[-0.045em] text-neutral-900 text-3xl leading-[0.95]">{trip?.name || ""}</h2>
        {trip?.destination && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-mono font-bold uppercase tracking-[0.15em] text-neutral-900">
            <MapPin className="w-3.5 h-3.5" /> {trip.destination}
          </p>
        )}
        <div className="mt-4 border-t border-neutral-900" />
        {start && end && (
          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-mono font-medium uppercase tracking-[0.3em] text-neutral-600">Departure</p>
              <p className="mt-1 font-heading font-black tracking-[-0.03em] text-neutral-900 text-4xl sm:text-5xl leading-none tabular-nums">{format(parseISO(start), "dd MMM").toUpperCase()}</p>
            </div>
            <Plane className="w-6 h-6 text-neutral-900 shrink-0 mt-4" />
            <div className="text-right">
              <p className="text-[13px] font-mono font-medium uppercase tracking-[0.3em] text-neutral-600">Return</p>
              <p className="mt-1 font-heading font-black tracking-[-0.03em] text-neutral-900 text-4xl sm:text-5xl leading-none tabular-nums">{format(parseISO(end), "dd MMM").toUpperCase()}</p>
            </div>
          </div>
        )}
        {start && (
          <div className="mt-6 border-t border-dashed border-neutral-400 pt-5">
            <p className="mb-3 text-[13px] font-mono font-medium uppercase tracking-[0.35em] text-neutral-600">Boarding In</p>
            <TripCountdown target={start} dark />
          </div>
        )}
        {count > 1 && (
          <div className="flex gap-1.5 mt-6">
            {Array.from({ length: count }).map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-5 bg-neutral-900" : "w-1.5 bg-neutral-300"}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}