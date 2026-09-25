import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { getCategory } from "./categories";
import { Image } from "@/components/ui/image";

export default function TripCarouselCard({ slide }) {
  const cat = getCategory(slide);
  const Icon = cat.icon;

  return (
    <div className="relative w-[280px] sm:w-[320px] h-[330px] sm:h-[420px] [perspective:1200px] shrink-0">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0, rotateY: 45, x: 80 }}
          animate={{ opacity: 1, rotateY: 0, x: 0 }}
          exit={{ opacity: 0, rotateY: -45, x: -80 }}
          transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
          className="absolute inset-0 rounded-xl overflow-hidden bg-neutral-900 shadow-2xl"
        >
          <Image src={slide.image_url} alt={slide.title} className="absolute inset-0 w-full h-full" fittingType="fill" />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/90 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 text-left">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-light uppercase tracking-widest ${cat.badge}`}>
              <Icon className="w-3 h-3" /> {cat.label}
            </span>
            <h3 className="mt-2.5 font-heading font-medium tracking-[-0.03em] text-white text-2xl leading-none">{slide.title}</h3>
            {slide.date && (
              <p className="mt-1.5 text-sm text-white/70">
                {format(parseISO(slide.date), "EEE, MMM d")}
                {slide.time ? ` · ${slide.time}` : ""}
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}