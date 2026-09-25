import React, { useState, useEffect } from "react";
import ImageReplaceButton from "./ImageReplaceButton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Pencil, Trash2, StickyNote, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { api } from "@/api/client";
import { getCategory } from "./categories";
import { Link } from 'react-router-dom';

export default function ItemDetailDialog({ item, onClose, onEdit, onDeleted, onUpdated }) {
  const [imageOverride, setImageOverride] = useState(null);
  useEffect(() => setImageOverride(null), [item?.id]);
  if (!item) return null;
  const imageUrl = imageOverride || item.image_url;
  const cat = getCategory(item);
  const Icon = cat.icon;

  const handleDelete = async () => {
    if (!window.confirm('Delete this booking and its attachments?')) return;
    await api.entities.TripItem.delete(item.id);
    onDeleted();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 border-0 max-w-none w-[calc(100vw-24px)] h-[calc(100dvh-24px)] sm:max-w-md sm:h-auto sm:max-h-[90vh] rounded-2xl overflow-hidden overflow-y-auto block [&>button]:hidden">
        <span className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <ImageReplaceButton item={item} onReplaced={(url) => { setImageOverride(url); onUpdated?.(); }} />
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white active:scale-95 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
        </span>
        {imageUrl && <img src={imageUrl} alt={item.title} className="w-full h-56 sm:h-40 object-cover" />}
        <div className="p-6 pt-5">
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${cat.soft}`}>
            <Icon className="w-3 h-3" />
            {item.title.includes(" · ") ? item.title.split(" · ")[0] : cat.label}
            {item.flight_number && <span className="font-mono">· {item.flight_number}</span>}
          </span>
          {item.title.includes(" · ") ? (
            <h2 className="mt-3 text-4xl font-heading font-medium tracking-[-0.04em] leading-tight text-neutral-900">
              {item.title.split(" · ").slice(1).join(" · ")}
            </h2>
          ) : (
            <h2 className="mt-3 text-4xl font-heading font-medium tracking-[-0.04em] leading-tight text-neutral-900">{item.title}</h2>
          )}
          {item.date && (
            <p className="mt-2 font-mono text-[13px] font-medium uppercase tracking-[0.15em] text-neutral-600">
              {format(parseISO(item.date), "EEE, MMM d")}
              {item.end_date ? ` → ${format(parseISO(item.end_date), "EEE, MMM d")}` : ""}
              {item.time ? ` · ${item.time}` : ""}
            </p>
          )}
          {item.confirmation_number && (
            <div className="mt-5 bg-neutral-800 rounded-xl p-5 text-center">
              <p className="font-mono text-[13px] font-medium uppercase tracking-[0.25em] text-neutral-300">Confirmation Number</p>
              <p className="mt-1 text-3xl font-mono font-medium text-white tracking-[0.08em] break-all">{item.confirmation_number}</p>
            </div>
          )}
          {item.notes && (
            <div className="mt-4 flex gap-2.5 bg-neutral-100 rounded-xl p-4 text-neutral-800">
              <StickyNote className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm leading-relaxed">{item.notes}</p>
            </div>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="block mt-5">
              <Button className="w-full h-14 text-base bg-neutral-800 text-white hover:bg-neutral-700 rounded-xl">
                <ExternalLink className="w-5 h-5 mr-2" /> View booking source
              </Button>
            </a>
          )}
          <div className="mt-3 flex gap-2">
            <Link to={`/trip/${item.trip_id}/wallet?item=${item.id}`} className="flex-1 rounded-lg bg-neutral-900 text-white text-sm py-3 text-center">View saved documents</Link>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onEdit(item)}>
              <Pencil className="w-4 h-4 mr-2" /> Edit
            </Button>
            <Button variant="outline" className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
