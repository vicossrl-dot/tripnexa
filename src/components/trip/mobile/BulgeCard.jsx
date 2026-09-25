import React, { useRef, useState, useEffect, useLayoutEffect, forwardRef } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";

const PAD = 56; // headroom above the card for the bulge to rise into
const R = 12; // corner radius, matches the day card rounding
const MAX_BULGE = 55;
const SPREAD = 110; // horizontal reach of the bump around the finger

function buildPath(w, h, b, cx) {
  const t = PAD;
  const x0 = Math.max(R, cx - SPREAD);
  const x1 = Math.min(w - R, cx + SPREAD);
  return `path('M 0 ${h - R} L 0 ${t + R} Q 0 ${t} ${R} ${t} L ${x0} ${t} C ${cx - SPREAD * 0.45} ${t - b}, ${cx + SPREAD * 0.45} ${t - b}, ${x1} ${t} L ${w - R} ${t} Q ${w} ${t} ${w} ${t + R} L ${w} ${h - R} Q ${w} ${h} ${w - R} ${h} L ${R} ${h} Q 0 ${h} 0 ${h - R} Z')`;
}

// Wraps a day card: while a finger is on the card and scrolling fast, the top
// edge bulges upward right under the finger, then springs back flat on rest.
/** @type {React.ForwardRefRenderFunction<HTMLDivElement, { accent?: boolean, className?: string, children?: React.ReactNode }>} */
const BulgeCardRender = ({ accent, className = "", children }, outerRef) => {
  const innerRef = useRef(null);
  const [size, setSize] = useState(null);

  // Border-box measurement (includes the PAD headroom)
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Scroll velocity → bulge target, only while the finger is over this card
  const target = useMotionValue(0);
  const bulge = useSpring(target, { damping: 16, stiffness: 140 });
  const bulgeX = useMotionValue(0.5); // finger x as a fraction of card width
  useEffect(() => {
    let lastY = window.scrollY;
    let lastT = performance.now();
    let touch = null;
    let timer;
    const onTouch = (e) => {
      const p = e.touches[0];
      if (p) touch = { x: p.clientX, y: p.clientY };
    };
    const onTouchEnd = () => {
      touch = null;
      target.set(0);
    };
    const onScroll = () => {
      const now = performance.now();
      const y = window.scrollY;
      const dt = Math.max(now - lastT, 1);
      const v = (Math.abs(y - lastY) / dt) * 1000; // px per second
      lastY = y;
      lastT = now;
      const el = innerRef.current;
      const rect = el && el.getBoundingClientRect();
      if (touch && rect && touch.y >= rect.top + PAD && touch.y <= rect.bottom) {
        bulgeX.set(Math.min(Math.max((touch.x - rect.left) / rect.width, 0), 1));
        target.set(Math.min(v / 55, MAX_BULGE));
      } else {
        target.set(0);
      }
      clearTimeout(timer);
      timer = setTimeout(() => target.set(0), 90);
    };
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [target, bulgeX]);

  // Use a height-independent inset clip at rest so the card can expand/collapse
  // smoothly; the measured SVG path only kicks in while an actual bulge is active.
  const clipPath = useTransform([bulge, bulgeX], ([b, fx]) =>
    size && b > 0.5
      ? buildPath(size.width, size.height, Math.max(0, b), fx * size.width)
      : `inset(${PAD}px 0 0 0 round ${R}px)`
  );

  const setRefs = (node) => {
    innerRef.current = node;
    if (typeof outerRef === "function") outerRef(node);
    else if (outerRef) outerRef.current = node;
  };

  return (
    <motion.div
      ref={setRefs}
      className={`${accent ? "bg-lime" : "bg-white"} ${className}`}
      style={{ clipPath, paddingTop: PAD, marginTop: -PAD }}
    >
      {children}
    </motion.div>
  );
}
const BulgeCard = forwardRef(BulgeCardRender);

export default BulgeCard;
