import { itineraryTimeLabel } from '@/lib/itinerary-time-label';
import React from "react";
import { ExternalLink, MapPin, Clock, Footprints, Navigation } from "lucide-react";
import { buildMapsLink, SOURCE_LABELS } from "@/lib/planningEngine";

export default function TransportCard({ item, trip }) {
  const mode = item.route_mode || "transit";
  const modeLabel = { walk: "Walk", transit: "Public transit", taxi: "Taxi", car: "Car" }[mode] || "Transport";
  const mapsLink = buildMapsLink({ origin: item.route_origin, destination: item.route_destination, mode });

  return (
    <div className="rounded-2xl bg-blue-400/[.035] border border-blue-300/15 p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            {mode === "walk" ? <Footprints className="w-4 h-4 text-blue-300" /> : <Navigation className="w-4 h-4 text-blue-300" />}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">{modeLabel}</span>
        </div>
        <span className="font-mono text-xs text-white/50">{itineraryTimeLabel(item)}</span>
      </div>
      <p className="text-sm font-medium text-white">{item.route_origin} → {item.route_destination}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/50">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {item.route_duration_min || item.duration_min || 0} min</span>
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {item.source_status==='api_provided'?'Google Maps estimate':SOURCE_LABELS[item.source_status] || "Estimated"}</span>
      </div>
      {item.notes && <details className="mt-2 text-xs text-white/60"><summary className="cursor-pointer">Transfer details</summary><p className="mt-2">{item.notes}</p></details>}
      <div className="mt-3 flex items-center gap-2">
        {mapsLink && (
          <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-300 hover:text-blue-200">
            <ExternalLink className="w-3.5 h-3.5" /> Open route in Google Maps
          </a>
        )}
      </div>
    </div>
  );
}
