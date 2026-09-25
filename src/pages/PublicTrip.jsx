import React, { useState, useEffect } from "react";
import TicketOptions from '@/components/itinerary/TicketOptions';
import { useParams } from "react-router-dom";
import { api } from "@/api/client";
import { format, parseISO } from "date-fns";
import { Compass, Clock, MapPin, AlertCircle, ExternalLink, Footprints, Navigation } from "lucide-react";
import { buildMapsLink, STATUS_LABELS } from "@/lib/planningEngine";

export default function PublicTrip() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.sharedTrip(token)
      .then((res) => {
        if (res?.error) {
          setError(res.error);
        } else {
          setData(res);
        }
      })
      .catch((e) => setError(e.message || "Failed to load trip"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white/20 border-t-lime rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-6">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Trip not available</h1>
          <p className="text-white/50 text-sm">{error}</p>
          <p className="text-white/30 text-xs mt-4">The owner may have disabled sharing or the link is invalid.</p>
        </div>
      </div>
    );
  }

  const { trip, items } = data;

  // Group by date
  const byDate = {};
  items.forEach((it) => {
    if (!byDate[it.date]) byDate[it.date] = [];
    byDate[it.date].push(it);
  });
  const dates = Object.keys(byDate).sort();

  return (
    <div className="min-h-screen bg-neutral-950 pb-16">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-neutral-950/90 backdrop-blur border-b border-white/10">
        <div className="px-[15px] py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-lime flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4 text-neutral-900" />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading font-bold text-white text-sm sm:text-base truncate">{trip.name}</h1>
            {trip.destination && (
              <p className="text-xs text-white/50 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {trip.destination}
              </p>
            )}
          </div>
          <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${trip.plan_status === "ready" || trip.plan_status === "completed" ? "bg-lime/20 text-lime" : "bg-amber-500/20 text-amber-300"}`}>
            {STATUS_LABELS[trip.plan_status] || "Draft"}
          </span>
        </div>
        <div className="px-[15px] pb-2 flex items-center gap-3 text-xs text-white/40">
          {trip.start_date && trip.end_date && (
            <span>{format(parseISO(trip.start_date), "d MMM")} – {format(parseISO(trip.end_date), "d MMM, yyyy")}</span>
          )}
          {trip.timezone && <span>· {trip.timezone}</span>}
        </div>
      </header>

      {/* Days */}
      <div className="max-w-2xl mx-auto px-[15px] py-6 space-y-8">
        {dates.length === 0 ? (
          <div className="text-center py-16 text-white/40">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No itinerary published yet.</p>
          </div>
        ) : (
          dates.map((date, di) => {
            const dayItems = byDate[date].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
            return (
              <div key={date} className="space-y-3">
                <div className="sticky top-[60px] z-10 bg-neutral-950/90 backdrop-blur py-2 -mx-[15px] px-[15px] border-b border-white/10">
                  <h2 className="font-heading font-bold text-white text-lg">{format(parseISO(date), "EEEE, d MMMM")}</h2>
                </div>
                {dayItems.map((it) => (
                  <div key={it.id}>
                    {it.step_type === "visit" ? (
                      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-sm text-white/70">{it.start_time}–{it.end_time}</span>
                          {it.ticket_status === "purchased" && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-lime/20 text-lime">Ticket purchased</span>
                          )}
                        </div>
                        <h3 className="font-heading font-semibold text-white text-lg mt-1.5">{it.title}</h3>
                        {data.affiliate_enabled&&<TicketOptions item={it} trip={trip} publicToken={token}/>}
                        {it.location && (
                          <p className="text-sm text-white/50 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> {it.location}
                          </p>
                        )}
                        <div className="mt-2 text-xs text-white/50 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {it.duration_min || 0} min
                        </div>
                      </div>
                    ) : it.step_type === "transport" ? (
                      <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                              {it.route_mode === "walk" ? <Footprints className="w-4 h-4 text-blue-300" /> : <Navigation className="w-4 h-4 text-blue-300" />}
                            </div>
                            <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                              {it.route_mode === "walk" ? "Walk" : it.route_mode === "transit" ? "Public transit" : it.route_mode === "taxi" ? "Taxi" : "Car"}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-white/50">{it.start_time}–{it.end_time}</span>
                        </div>
                        <p className="text-sm font-medium text-white">{it.title}</p>
                        <div className="mt-2 text-xs text-white/50 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {it.route_duration_min || it.duration_min || 0} min
                        </div>
                        {it.route_origin && it.route_destination && (
                          <a
                            href={buildMapsLink({ origin: it.route_origin, destination: it.route_destination, mode: it.route_mode || "transit" })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
                          >
                            <ExternalLink className="w-3 h-3" /> Open in Google Maps
                          </a>
                        )}
                      </div>
                    ) : it.step_type === "meal" ? (
                      <div className="rounded-xl bg-orange-500/5 border border-orange-500/20 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-orange-200">🍽️ {it.title}</span>
                          <span className="font-mono text-xs text-white/50">{it.start_time}–{it.end_time}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                        <span className="text-sm text-white/60">{it.title}</span>
                        <span className="font-mono text-xs text-white/40 ml-2">{it.start_time}–{it.end_time}</span>
                      </div>
                    )}
                    {it.restaurant&&<div className="text-sm text-white/60 mt-2"><p>{it.restaurant.category}</p><p>{it.location}</p><a href={it.restaurant.maps_url} target="_blank" rel="noopener noreferrer" className="text-lime">Open in Google Maps</a></div>}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="max-w-2xl mx-auto px-[15px] mt-8">
        <div className="flex items-center justify-center gap-2 text-xs text-white/30">
          <Compass className="w-3 h-3" /> Shared via TripSync · View-only
        </div>
      </div>
    </div>
  );
}
