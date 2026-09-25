import React, { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { getCategory } from "./categories";
import CanvasTabs from "./CanvasTabs";

function useColumnCount() {
  const get = () => {
    const w = window.innerWidth;
    if (w >= 1920) return 5;
    if (w >= 1536) return 4;
    if (w >= 1100) return 3;
    if (w >= 640) return 2;
    return 1;
  };
  const [n, setN] = useState(get);
  useEffect(() => {
    const onResize = () => setN(get());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return n;
}

export default function CanvasView({ items, onSelect }) {
  const colCount = useColumnCount();
  const [tab, setTab] = useState("flight");

  const visible = items
    .filter((i) => i.category === tab)
    .sort((a, b) => ((a.date || "9999") + (a.time || "99")).localeCompare((b.date || "9999") + (b.time || "99")));

  const cols = Array.from({ length: colCount }, () => []);
  visible.forEach((item, i) => cols[i % colCount].push(item));

  const renderCard = (item, i) => {
    const cat = getCategory(item);
    const Icon = cat.icon;
    return (
      <motion.button
        key={item.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: i * 0.04 }}
        onClick={() => onSelect(item)}
        className="block w-full text-left bg-white rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.08),0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-300 hover:shadow-xl hover:scale-[1.02]"
      >
        {item.image_url && (
          <div className="overflow-hidden">
            <img src={item.image_url} alt={item.title} className="w-full h-44 object-cover" />
          </div>
        )}
        <div className="p-5">
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-light uppercase tracking-wider px-2.5 py-1 rounded-full ${cat.soft}`}>
            <Icon className="w-3 h-3" /> {cat.label}
          </span>
          <h3 className="mt-3 font-heading font-medium tracking-[-0.03em] text-2xl text-neutral-900 leading-[0.95]">{item.title}</h3>
          {item.date && (
            <p className="mt-2 text-[13px] font-light uppercase tracking-[0.15em] text-neutral-600">
              {format(parseISO(item.date), "EEE, MMM d")}
              {item.time ? ` · ${item.time}` : ""}
            </p>
          )}
        </div>
      </motion.button>
    );
  };

  return (
    <div>
      <CanvasTabs active={tab} onChange={setTab} />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {visible.length === 0 ? (
            <p className="text-center text-white/75 py-16">Nothing in this category yet.</p>
          ) : (
            <div className="flex gap-[15px] items-start">
              {cols.map((col, ci) => (
                <div key={ci} className="flex-1 min-w-0 space-y-[15px]">
                  {col.map((item, ri) => renderCard(item, ri))}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}