import React from "react";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";

export default function NewTripCard({ onClick }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="group shrink-0 flex w-[140px] sm:w-[155px] flex-col items-center gap-3 px-2 pt-2 pb-1 text-white/70 hover:text-white transition-colors"
    >
      <div className="h-[68px] flex items-end justify-center">
        <div className="w-[72px] h-[58px] rounded-xl border border-dashed border-white/40 group-hover:border-lime/70 flex items-center justify-center transition-colors">
          <span className="w-8 h-8 rounded-full bg-lime flex items-center justify-center">
            <Plus className="w-4 h-4 text-neutral-900" />
          </span>
        </div>
      </div>
      <div className="text-center">
        <span className="font-heading font-medium tracking-tight text-base leading-tight block">New Trip</span>
        <span className="mt-1 block text-[13px] font-light uppercase tracking-[0.08em] text-white/70 whitespace-nowrap">Pack a new bag</span>
      </div>
    </motion.button>
  );
}