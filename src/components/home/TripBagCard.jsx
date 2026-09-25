import React, { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import Folder from "@/components/Folder";
import PassportStamp from "@/components/home/PassportStamp";
import DeleteTripDialog from "@/components/home/DeleteTripDialog";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";

const STATUS_BADGE = {
  completed: { label: "Completed", className: "bg-lime text-neutral-900" },
  ready: { label: "Ready", className: "bg-lime/80 text-neutral-900" },
  in_progress: { label: "In progress", className: "bg-amber-400 text-neutral-900" },
  calculated: { label: "Planned", className: "bg-blue-500 text-white" },
  needs_verification: { label: "In progress", className: "bg-amber-400 text-neutral-900" },
  draft: { label: "In progress", className: "bg-amber-400 text-neutral-900" },
};

export default function TripBagCard({ trip, endedOn, onDeleted }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const items = trip.cover_image_url
    ? [<img key="cover" src={trip.cover_image_url} alt="" className="w-full h-full object-cover" />]
    : [];
  const status = STATUS_BADGE[trip.plan_status] || STATUS_BADGE.draft;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="shrink-0">
      <ContextMenu>
      <ContextMenuTrigger asChild>
      <Link to={`/trip/${trip.id}${trip.plan_version > 0 ? '/itinerary' : ''}`} className="group flex w-[140px] sm:w-[155px] flex-col items-center gap-3 px-2 pt-2 pb-1">
        <div className="relative h-[68px] flex items-end justify-center">
          <Folder size={0.72} color="#ffbca4" items={items} />
          {endedOn && <PassportStamp date={endedOn} />}
        </div>
        <div className="text-center w-full">
          <h3 className="font-heading font-medium tracking-tight text-white text-base leading-tight truncate">{trip.name}</h3>
          {trip.destination && (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-white/75 min-w-0">
              <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{trip.destination}</span>
            </p>
          )}
          {trip.start_date && trip.end_date && (
            <p className="mt-0.5 text-[10px] text-white/40 font-mono">
              {new Date(trip.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" – "}
              {new Date(trip.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
          <span className={`mt-1.5 inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${status.className}`}>
            {status.label}
          </span>
        </div>
      </Link>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          className="text-red-600 focus:text-red-600"
          onSelect={() => setConfirmOpen(true)}
        >
          <Trash2 className="w-4 h-4 mr-2" /> Delete trip
        </ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>
      <DeleteTripDialog
        trip={trip}
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onDeleted={(id) => { setConfirmOpen(false); onDeleted?.(id); }}
      />
    </motion.div>
  );
}
