import React from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, ListOrdered, Plus, FileText, CalendarCheck } from "lucide-react";

export default function MobileDock({ tripId, onAdd, view, onToggleView, hasPlan }) {
  return (
    <nav className="lg:hidden fixed bottom-[max(16px,env(safe-area-inset-bottom))] inset-x-3 z-40">
      <div className="flex items-center justify-around bg-neutral-900/40 backdrop-blur-2xl backdrop-saturate-150 border border-white/20 rounded-full px-2 py-2.5 shadow-2xl">
        <button
          onClick={onToggleView}
          className="flex flex-col items-center gap-0.5 px-2 text-white/80 active:text-white"
        >
          {view === "canvas" ? <ListOrdered className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
          <span className="text-[11px] font-medium">{view === "canvas" ? "Timeline" : "Canvas"}</span>
        </button>
        <Link to={`/trip/${tripId}/plan`} className="flex flex-col items-center gap-0.5 px-2 text-lime active:text-lime">
          <CalendarCheck className="w-5 h-5" />
          <span className="text-[11px] font-medium">{hasPlan ? "Update" : "Plan"}</span>
        </Link>
        <button
          onClick={onAdd}
          className="w-11 h-11 rounded-full bg-lime flex items-center justify-center shadow-xl active:scale-95 transition-transform"
          aria-label="Add to trip"
        >
          <Plus className="w-6 h-6 text-neutral-900" />
        </button>
        <Link to={`/trip/${tripId}/itinerary`} className="flex flex-col items-center gap-0.5 px-2 text-white/80 active:text-white">
          <CalendarCheck className="w-5 h-5" />
          <span className="text-[11px] font-medium">Itinerary</span>
        </Link>
        <Link to={`/trip/${tripId}/documents`} className="flex flex-col items-center gap-0.5 text-white/80 active:text-white px-2">
          <FileText className="w-5 h-5" />
          <span className="text-[11px] font-medium">Wallet</span>
        </Link>
      </div>
    </nav>
  );
}