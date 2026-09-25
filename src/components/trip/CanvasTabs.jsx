import React from "react";
import { motion } from "framer-motion";

const TABS = [
  { key: "flight", label: "Transport" },
  { key: "stay", label: "Stays" },
  { key: "place", label: "Places" },
  { key: "document", label: "Docs" },
];

export default function CanvasTabs({ active, onChange }) {
  return (
    <div className="mb-5 lg:mb-[33px] inline-flex bg-white/10 backdrop-blur rounded-full p-1">
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`relative rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            active === t.key ? "text-neutral-900" : "text-white/75 hover:text-white"
          }`}
        >
          {active === t.key && (
            <motion.span layoutId="canvas-tab-pill" className="absolute inset-0 bg-lime rounded-full" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
          )}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  );
}