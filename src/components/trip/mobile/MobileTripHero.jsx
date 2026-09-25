import React, { useState, useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { Image } from "@/components/ui/image";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import TabletHeroCard from "./TabletHeroCard";
import TravelBackground from '../TravelBackground';

export default function MobileTripHero({ trip, items }) {
  const dates = (items || []).map((i) => i.date).filter(Boolean).sort();
  const start = dates[0];
  const end = (items || []).map((i) => i.end_date || i.date).filter(Boolean).sort().at(-1);
  const daysToGo = start ? differenceInCalendarDays(parseISO(start), new Date()) : null;

  // Cycle through the AI-generated item images, like the desktop hero
  const slides = (items || []).filter((i) => i.image_url && i.category !== "document");
  const [index, setIndex] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(
      () =>
        setIndex((i) => {
          prevRef.current = i;
          return (i + 1) % slides.length;
        }),
      4000
    );
    return () => clearInterval(t);
  }, [slides.length]);

  const activeIndex = index % slides.length;
  const fallback = trip?.cover_image_url;

  return (
    <div className="relative mx-[15px] h-[calc(100dvh-159px)] rounded-3xl overflow-hidden bg-neutral-800 [perspective:1200px]">
      <TravelBackground type={trip?.travel_type} />
      {slides.length > 0 ? (
        slides.map((s, i) => {
          const active = i === activeIndex;
          const isPrev = i === prevRef.current && !active;
          return (
            <motion.div
              key={s.id}
              initial={false}
              animate={{ rotateY: active ? 0 : isPrev ? -90 : 90 }}
              transition={{ duration: 0.85, ease: [0.45, 0, 0.2, 1] }}
              style={{
                transformStyle: "preserve-3d",
                backfaceVisibility: "hidden",
                zIndex: active ? 2 : isPrev ? 1 : 0,
                visibility: active || isPrev ? "visible" : "hidden",
              }}
              className="absolute inset-x-8 top-14 bottom-44 rounded-2xl overflow-hidden shadow-xl"
            >
              <Image src={s.image_url} alt={s.title} className="w-full h-full" fittingType="fill" />
            </motion.div>
          );
        })
      ) : fallback ? (
        <Image src={fallback} alt={trip?.name || ""} className="absolute inset-x-8 top-14 bottom-44 w-[calc(100%-4rem)] rounded-2xl" fittingType="fill" />
      ) : (
        null
      )}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <TabletHeroCard trip={trip} start={start} end={end} count={slides.length} index={activeIndex} />
      <div className="md:hidden absolute inset-x-3 bottom-3 z-20 rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_10px_30px_rgba(0,0,0,0.08)]">
        <h2 className="font-heading font-semibold tracking-tight text-neutral-900 text-2xl leading-tight">{trip?.name}</h2>
        {trip?.destination && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-neutral-600">
            <MapPin className="w-3.5 h-3.5" /> {trip.destination}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {start && (
            <span className="font-mono text-[13px] uppercase tracking-[0.08em] text-neutral-700">
              {format(parseISO(start), "dd.MM")} — {end ? format(parseISO(end), "dd.MM.yy") : ""}
            </span>
          )}
          {daysToGo > 0 && (
            <span className="font-mono text-[13px] uppercase tracking-[0.08em] text-neutral-900 bg-lime rounded-full px-2.5 py-0.5">In {daysToGo} days</span>
          )}
        </div>
        {slides.length > 1 && (
          <div className="mt-3 flex gap-1.5">
            {slides.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index % slides.length ? "w-5 bg-lime" : "w-1.5 bg-neutral-200"}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
