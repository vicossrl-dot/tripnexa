import React, { useEffect, useRef } from "react";

// Scroll progress on the timeline rail: a bright dashed line grows down the
// faint track as you move through the days — no dot, just the line advancing.
export default function RailProgress() {
  const ref = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      const el = ref.current;
      const rail = el?.closest("[data-rail]");
      if (el && rail) {
        const r = rail.getBoundingClientRect();
        // progress marker rides at 80px from the viewport top (below the app header)
        const h = Math.min(Math.max(80 - r.top, 0), r.height);
        el.style.height = `${h}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      className="absolute top-0 left-[7px] border-l border-dashed border-white/80"
      style={{ height: 0 }}
    />
  );
}