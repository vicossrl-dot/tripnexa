import React from "react";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";

export default function AddFirstCard({ onAdd }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onAdd()}
      className="w-full sm:w-64 h-64 rounded-xl border-2 border-dashed border-white/30 flex flex-col items-center justify-center gap-3 text-white/70 hover:border-lime hover:text-white transition-colors group"
    >
      <div className="w-12 h-12 rounded-full bg-lime flex items-center justify-center group-hover:scale-110 transition-transform">
        <Plus className="w-5 h-5 text-neutral-900" />
      </div>
      <p className="font-heading font-bold tracking-tight">Add your first document</p>
      <p className="text-xs text-white/50 px-6">Flights, stays, places or files — everything lives here.</p>
    </motion.button>
  );
}