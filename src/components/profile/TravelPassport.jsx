import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { MapPin, Stamp } from "lucide-react";
import PassportStamp from "@/components/home/PassportStamp";

export default function TravelPassport() {
  const [data, setData] = useState(null);

  useEffect(() => {
    Promise.all([
      api.entities.Trip.list("-created_date"),
      api.entities.TripItem.list(undefined, 500),
    ]).then(([trips, items]) => {
      const range = {};
      items.forEach((i) => {
        const start = i.date;
        const end = i.end_date || i.date;
        if (!start && !end) return;
        const r = range[i.trip_id] || { first: null, last: null };
        if (start && (!r.first || start < r.first)) r.first = start;
        if (end && (!r.last || end > r.last)) r.last = end;
        range[i.trip_id] = r;
      });
      const today = new Date().toISOString().slice(0, 10);
      const completed = trips
        .filter((t) => range[t.id]?.last && range[t.id].last < today)
        .map((t) => ({ ...t, ...range[t.id] }));
      const days = completed.reduce((sum, t) => {
        if (!t.first || !t.last) return sum;
        return sum + Math.round((new Date(t.last).getTime() - new Date(t.first).getTime()) / 86400000) + 1;
      }, 0);
      const destinations = new Set(completed.map((t) => t.destination).filter(Boolean)).size;
      setData({ completed, days, destinations });
    });
  }, []);

  if (data === null) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: data.completed.length, label: "Trips Completed" },
          { value: data.destinations, label: "Destinations" },
          { value: data.days, label: "Travel Days" },
        ].map((s) => (
          <div key={s.label} className="bg-neutral-100 rounded-[12px] p-4 text-center">
            <p className="font-heading font-black text-2xl text-neutral-900 leading-none">{s.value}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-600 mt-1.5">{s.label}</p>
          </div>
        ))}
      </div>

      {data.completed.length === 0 ? (
        <div className="text-center py-10">
          <Stamp className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-600">No stamps yet, your finished trips will land here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.completed.map((trip) => (
            <Link
              key={trip.id}
              to={`/trip/${trip.id}`}
              className="relative flex items-center justify-between gap-3 bg-neutral-100 hover:bg-neutral-200 transition-colors rounded-[12px] p-4"
            >
              <div className="min-w-0">
                <p className="font-heading font-bold text-neutral-900 truncate">{trip.name}</p>
                {trip.destination && (
                  <p className="flex items-center gap-1 text-xs text-neutral-600 mt-1">
                    <MapPin className="w-3 h-3 shrink-0" /> {trip.destination}
                  </p>
                )}
                <p className="text-xs text-neutral-500 mt-1">
                  {new Date(trip.first).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {new Date(trip.last).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <div className="relative w-[90px] h-[80px] shrink-0">
                <PassportStamp date={trip.last} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
