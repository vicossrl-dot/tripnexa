import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import MobileDaySection from "./MobileDaySection";
import RailProgress from "./RailProgress";

export default function MobileDayCarousel({ items, onSelect }) {
  const dated = items.filter((i) => i.date).sort((a, b) => (a.date + (a.time || "99")).localeCompare(b.date + (b.time || "99")));
  const days = [...new Set(dated.map((i) => i.date))];
  const extras = items.filter((i) => !i.date);

  const today = format(new Date(), "yyyy-MM-dd");
  const slides = days.map((date, idx) => {
    const d = parseISO(date);
    return {
      key: date,
      dayLabel: `Day ${idx + 1}`,
      heading: `${format(d, "EEEE, MMMM d")}`,
      list: dated.filter((i) => i.date === date),
      past: date < today,
      accent: false,
    };
  });
  if (extras.length > 0) slides.push({ key: "extras", dayLabel: "Extras", heading: "Docs & extras.", list: extras, accent: true, past: false });

  const [openKey, setOpenKey] = useState(slides[0]?.key ?? null);

  if (slides.length === 0) return null;

  return (
    <div className="relative pr-[15px]">
      {/* Dashed rail: faint full track + a brighter dashed line that advances
          down it with the scroll — a scroll-driven progress marker */}
      <div data-rail="" className="absolute left-0 top-0 bottom-0 w-[30px] z-20 pointer-events-none [overflow:clip]" aria-hidden="true">
        <div data-line="" className="absolute top-0 left-[7px] border-l border-dashed border-white/20" style={{ height: "100%" }} />
        <RailProgress />
      </div>
      <div className="flex flex-col pl-[15px]">
        {slides.map((slide) => (
          <MobileDaySection
            key={slide.key}
            slide={slide}
            open={openKey === slide.key}
            onToggle={() => setOpenKey(openKey === slide.key ? null : slide.key)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
