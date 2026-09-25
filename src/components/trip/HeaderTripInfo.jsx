import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Plane } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function HeaderTripInfo({ items, trip, show }) {
  const dates = (items || []).filter((i) => i.date).map((i) => i.date).sort();
  const endDates = (items || []).flatMap((i) => [i.date, i.end_date].filter(Boolean)).sort();
  const start = dates[0];
  const end = endDates[endDates.length - 1];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          className="hidden lg:flex items-center gap-5 absolute left-1/2 -translate-x-1/2"
        >
          <span className="inline-flex items-center gap-1.5 text-[13px] font-light uppercase tracking-[0.25em] text-white">
            <MapPin className="w-3 h-3 text-lime" /> {trip?.name || ""}
          </span>
          {start && end && (
            <span className="flex items-center gap-2 text-white">
              <span className="font-heading font-medium text-sm tabular-nums">{format(parseISO(start), "dd MMM").toUpperCase()}</span>
              <Plane className="w-3.5 h-3.5 text-white/40" />
              <span className="font-heading font-medium text-sm tabular-nums">{format(parseISO(end), "dd MMM").toUpperCase()}</span>
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}