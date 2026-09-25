import React from "react";
import { motion } from "framer-motion";
import { Plane } from "lucide-react";

export default function PlaneTakeoff() {
  return (
    <div className="relative h-28 -mx-6 -mt-6 mb-1 rounded-t-xl overflow-hidden bg-gradient-to-b from-sky-100 via-orange-50 to-white">
      {/* clouds */}
      <div className="absolute top-4 left-6 w-14 h-4 bg-white rounded-full opacity-90" />
      <div className="absolute top-8 right-10 w-20 h-5 bg-white rounded-full opacity-80" />
      <div className="absolute top-14 left-1/3 w-10 h-3 bg-white rounded-full opacity-70" />
      {/* takeoff trail */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 112" fill="none" preserveAspectRatio="none">
        <path d="M20 100 Q 180 96, 300 40" stroke="#a3a3a3" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
      </svg>
      {/* plane */}
      <motion.div
        initial={{ x: -60, y: 34, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
        className="absolute right-9 top-3"
      >
        <div className="w-12 h-12 rounded-full bg-lime flex items-center justify-center shadow-md">
          <Plane className="w-6 h-6 text-neutral-900 -rotate-[20deg]" fill="currentColor" />
        </div>
      </motion.div>
      {/* runway */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-neutral-200" />
    </div>
  );
}