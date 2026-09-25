import { itineraryTimeLabel } from '@/lib/itinerary-time-label';
import React, {useState} from "react";
import TicketOptions from './TicketOptions';
import { Clock, MapPin, Tag, Lock, ExternalLink } from "lucide-react";
import { SOURCE_LABELS } from "@/lib/planningEngine";

const TICKET_LABELS = {
  none: "Free",
  entry: "Entry",
  guided_tour: "Guided tour",
  zone: "Specific zones",
  package: "Package",
};

const STATUS_COLORS = {
  needed: "bg-amber-500/20 text-amber-300",
  purchased: "bg-lime/20 text-lime",
  free: "bg-white/10 text-white/60",
  to_verify: "bg-blue-500/20 text-blue-300",
  unavailable: "bg-red-500/20 text-red-300",
};

export default function VisitCard({ item, trip, ticketAdded = false }) {
  const [booking,setBooking]=useState(null);
  return (
    <div className="trip-card">
      <p className="trip-eyebrow flex items-center gap-2 mb-3"><MapPin size={15}/>Visit</p>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-white/70">{itineraryTimeLabel(item)}</span>
          {item.locked && <Lock className="w-3 h-3 text-white/40" />}
        </div>
        {item.ticket_status && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[item.ticket_status] || "bg-white/10"}`}>
            {booking?.saved||ticketAdded ? 'Ticket saved' : booking?.booked ? 'Booked' : item.ticket_status === "needed" ? "Ticket needed" : item.ticket_status === "purchased" ? "Ticket purchased" : item.ticket_status === "free" ? "Free" : item.ticket_status === "to_verify" ? "To verify" : "Unavailable"}
          </span>
        )}
      </div>
      <h3 className="font-heading font-semibold text-white text-lg mt-1.5">{item.title}</h3>
      {item.location && (
        <p className="text-sm text-white/50 mt-0.5 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {item.location}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/50">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {item.duration_min || 0} min</span>
        {item.ticket_type && item.ticket_type !== "none" && (
          <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> {TICKET_LABELS[item.ticket_type] || item.ticket_type}</span>
        )}
        <span>{SOURCE_LABELS[item.source_status] || "Estimated"}</span>
      </div>
      {item.notes && <p className="text-sm text-white/60 mt-2 bg-white/5 rounded-lg p-2">{item.notes}</p>}
      {item.source_url && !item.source_url.startsWith('/api/uploads/') && (
        <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-lime hover:text-lime/80">
          <ExternalLink className="w-3 h-3" /> View booking source
        </a>
      )}
      <TicketOptions item={item} trip={trip} onBooking={setBooking}/>
    </div>
  );
}
