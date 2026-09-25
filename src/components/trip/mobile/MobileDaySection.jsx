import React, { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MobileItemCard from "./MobileItemCard";
import RowSeam from "./RowSeam";
import BulgeCard from "./BulgeCard";
import MobileClosedIcons from "./MobileClosedIcons";

export default function MobileDaySection({ slide, open, onToggle, onSelect }) {
  const accent = slide.accent;
  const headerRef = useRef(null);

  // Opening a day auto-closes the previously open one — if that one sits
  // ABOVE, the page shrinks and yanks the tapped card upward. Pin the tapped
  // header to its viewport spot for the whole expand/collapse animation.
  const handleToggle = () => {
    const el = headerRef.current;
    const top = el ? el.getBoundingClientRect().top : 0;
    onToggle();
    if (!el) return;
    const start = performance.now();
    const step = () => {
      if (!el.isConnected) return;
      const d = el.getBoundingClientRect().top - top;
      if (Math.abs(d) > 0.5) window.scrollBy(0, d);
      if (performance.now() - start < 450) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  return (
    <section className={`scroll-mt-24 ${slide.past ? "opacity-50 grayscale" : ""}`}>
      {/* Day header lives ON the card itself — pinkish accent for days,
          neutral for the docs/extras card. */}
      <div className="pt-6" />
      <BulgeCard>
        <button
          ref={headerRef}
          onClick={handleToggle}
          className="w-full flex items-baseline gap-3 px-5 text-left bg-lime pt-4 pb-3"
        >
          <span className="shrink-0 font-mono text-[13px] font-light uppercase tracking-[0.25em] text-neutral-600">{slide.dayLabel}</span>
          <span className="flex-1 min-w-0 font-heading font-medium tracking-[-0.03em] text-[19px] leading-tight truncate text-neutral-900">{slide.heading}</span>
          <ChevronDown className={`shrink-0 self-center w-4 h-4 transition-transform duration-300 text-neutral-500 ${open ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="open"
              initial={{ height: 76, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0 } }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="py-1.5">
                {slide.list.map((item, i) => (
                  <React.Fragment key={item.id}>
                    {i > 0 && (
                      <div data-seam="" {...(slide.accent ? { "data-docs": "" } : {})}>
                        <RowSeam />
                      </div>
                    )}
                    <div className="px-5">
                      <MobileItemCard item={item} onSelect={onSelect} />
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="closed"
              onClick={handleToggle}
              initial={false}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0 } }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="w-full overflow-hidden text-left"
            >
              <MobileClosedIcons items={slide.list} accent={accent} />
            </motion.button>
          )}
        </AnimatePresence>
      </BulgeCard>
    </section>
  );
}