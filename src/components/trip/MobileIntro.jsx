import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { ChevronUp } from "lucide-react";

const CLOSED = "/media/501ecc3e4_travelapp_Gemini3NanoBananaPro_2026-07-19_10-58-20.png";
const OPEN = "/media/1e6a33e56_travelapp_Gemini3NanoBananaPro_2026-07-19_10-57-48.png";

let shownThisLoad = false; // resets on every full page load / refresh

export default function MobileIntro() {
  const [opened, setOpened] = useState(false);
  // Show only on a fresh page load (or refresh) — skipped for in-app navigation
  const [gone, setGone] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.innerWidth >= 1024) return true;
    if (shownThisLoad) return true;
    shownThisLoad = true;
    return false;
  });
  const progress = useMotionValue(0); // 0 = closed, 100 = fully open
  const clipPath = useTransform(progress, (p) => `inset(0% 0% ${p}% 0%)`);

  useEffect(() => {
    if (gone) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [gone]);

  useEffect(() => {
    if (!opened) return;
    animate(progress, 100, { duration: 0.9, ease: [0.32, 0.72, 0, 1] });
    const t = setTimeout(() => setGone(true), 2400);
    return () => clearTimeout(t);
  }, [opened, progress]);

  if (gone) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="intro"
        exit={{ opacity: 0 }}
        animate={opened ? { opacity: 0 } : { opacity: 1 }}
        transition={opened ? { delay: 1.8, duration: 0.6 } : undefined}
        onPan={(e, info) => {
          if (opened) return;
          progress.set(Math.min(60, Math.max(0, -info.offset.y / 5)));
        }}
        onPanEnd={(e, info) => {
          if (opened) return;
          if (info.offset.y < -70) setOpened(true);
          else animate(progress, 0, { duration: 0.3 });
        }}
        onTap={() => { if (!opened) setOpened(true); }}
        className="lg:hidden fixed inset-0 z-[60] bg-neutral-100 overflow-hidden touch-none"
      >
        <img src={OPEN} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <motion.img
          src={CLOSED}
          alt=""
          style={{ clipPath }}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
        <motion.div
          animate={opened ? { opacity: 0 } : { opacity: 1 }}
          className="absolute bottom-10 inset-x-0 flex flex-col items-center gap-2 pointer-events-none"
        >
          <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}>
            <ChevronUp className="w-7 h-7 text-white drop-shadow" />
          </motion.div>
          <p className="font-heading font-black tracking-[-0.03em] text-white text-3xl leading-none drop-shadow">Swipe up.</p>
          <p className="text-[11px] font-light uppercase tracking-[0.3em] text-white/80 drop-shadow">Start planning your trip</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}