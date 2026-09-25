import React, { useState, useEffect } from "react";
import { MapPin, Plane } from "lucide-react";
import { format, parseISO } from "date-fns";
import TripCarouselCard from "./TripCarouselCard";
import TripCountdown from "./TripCountdown";
import TravelBackground from './TravelBackground';
import { travelLabel } from '@/lib/travel-types';

export default function DestinationHero({ items, trip }) {
  const slides = (items || []).filter((i) => i.image_url && i.category !== "document");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);

  if (slides.length === 0) {
    return (
      <div className="relative isolate overflow-hidden bg-neutral-950 pt-28 pb-10 lg:pb-40 px-[15px] text-center">
        <div className="absolute inset-0 -z-10"><TravelBackground type={trip?.travel_type} /></div>
        {trip?.travel_type && <p className="text-xs text-lime mb-2">Traveling by {travelLabel(trip.travel_type)}</p>}
        <p className="text-[13px] font-mono font-medium uppercase tracking-[0.3em] text-white/75">Trip</p>
        <h2 className="mt-2 font-heading font-black tracking-[-0.045em] text-white text-4xl sm:text-5xl leading-[0.95]">{trip?.name || ""}</h2>
        {trip?.destination && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-mono font-bold uppercase tracking-[0.15em] text-white/85">
            <MapPin className="w-3.5 h-3.5" /> {trip.destination}
          </p>
        )}
      </div>
    );
  }

  const slide = slides[index % slides.length];
  const dates = (items || []).filter((i) => i.date).map((i) => i.date).sort();
  const endDates = (items || []).flatMap((i) => [i.date, i.end_date].filter(Boolean)).sort();
  const start = dates[0];
  const end = endDates[endDates.length - 1];

  return (
    <div className="relative h-screen min-h-[680px] overflow-hidden bg-neutral-950">
      <TravelBackground type={trip?.travel_type} />
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/30 via-neutral-950/10 to-neutral-950/25" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-[15px] pt-20 lg:pt-0 pb-6 lg:pb-24">
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-2xl max-w-full w-full sm:w-auto flex flex-col lg:flex-row items-center gap-3 lg:gap-10">
        <div className="text-left order-2 lg:order-none p-3 sm:p-6 max-w-full w-full lg:w-[480px]">
          <p className="text-[13px] font-mono font-medium uppercase tracking-[0.3em] text-neutral-600">Trip</p>
          <h2 className="mt-1.5 font-heading font-medium tracking-[-0.045em] text-neutral-900 text-2xl sm:text-3xl lg:text-4xl leading-[0.95]">
            {trip?.name ? `${trip.name}` : ""}
          </h2>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-mono font-bold uppercase tracking-[0.15em] text-neutral-900">
            <MapPin className="w-3.5 h-3.5" /> {trip?.destination || "Destination"}
          </p>
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
          <div className="hidden lg:flex gap-1.5 mt-6">
            {slides.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index % slides.length ? "w-5 bg-neutral-900" : "w-1.5 bg-neutral-300"}`} />
            ))}
          </div>
        </div>
        <div className="order-1 lg:order-none max-w-full"><TripCarouselCard slide={slide} /></div>
        </div>
        <div className="flex lg:hidden gap-1.5">
          {slides.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index % slides.length ? "w-5 bg-lime" : "w-1.5 bg-white/50"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
