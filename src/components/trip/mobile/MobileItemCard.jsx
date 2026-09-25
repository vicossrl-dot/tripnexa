import React from "react";
import { getCategory } from "@/components/trip/categories";

export default function MobileItemCard({ item, onSelect }) {
  const cat = getCategory(item);
  const Icon = cat.icon;
  const note = (item.notes || "").split("\n")[0];
  return (
    <button
      onClick={() => onSelect(item)}
      className="w-full flex items-center gap-3.5 py-3 text-left active:scale-[0.98] transition-transform"
    >
      <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px] text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-heading font-semibold text-neutral-900 text-[15px] leading-snug truncate">{item.title}</p>
        <p className="mt-0.5 font-mono text-[13px] uppercase tracking-[0.05em] text-neutral-500 truncate">
          {cat.label}
          {note && <span className="normal-case tracking-normal font-body"> · {note}</span>}
        </p>
      </div>
      {item.time && (
        <p className="shrink-0 font-mono text-[13px] uppercase tracking-[0.05em] text-neutral-500">{item.time}</p>
      )}
    </button>
  );
}