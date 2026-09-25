import React from "react";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { AlertCircle } from "lucide-react";
import { getCategory } from "./categories";
import { getItemIssues } from "@/lib/planningEngine";
import CardStack from "./CardStack";
import DocumentsFolder from "./DocumentsFolder";

export default function TimelineView({ items, onSelect }) {
  // Items without a time (e.g. hotel check-in) sort after timed items on the same day
  const dated = items.filter((i) => i.date).sort((a, b) => (a.date + (a.time || "99:99")).localeCompare(b.date + (b.time || "99:99")));
  const undated = items.filter((i) => !i.date);
  const days = [...new Set(dated.map((i) => i.date))];
  const today = format(new Date(), "yyyy-MM-dd");

  const renderItem = (item) => {
    const cat = getCategory(item);
    const Icon = cat.icon;
    return (
      <button
        key={item.id}
        onClick={() => onSelect(item)}
        className="w-full flex items-center gap-4 bg-white p-4 text-left transition-all duration-200"
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cat.badge}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-medium tracking-tight text-neutral-900 truncate">{item.title}</p>
          <p className="text-sm text-neutral-600">{cat.label}{item.notes ? ` · ${item.notes.slice(0, 60)}${item.notes.length > 60 ? "…" : ""}` : ""}</p>
          {getItemIssues(item).length > 0 && (
            <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-amber-600">
              <AlertCircle className="w-3 h-3" /> Missing: {getItemIssues(item).map((i) => i.label).join(", ")}
            </span>
          )}
        </div>
        {item.time && <span className="text-sm font-mono font-medium text-neutral-600 shrink-0">{item.time}</span>}
      </button>
    );
  };

  return (
    <div className="w-full space-y-8 lg:-mt-[11.5px]">
      {days.map((day, di) => (
        <motion.div key={day} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: di * 0.08 }}>
          <div className={`border-l-2 border-white/20 pl-4 ml-1 ${day < today ? "opacity-50 grayscale" : ""}`}>
            <CardStack>
              {[
                <div key="day-header" className="bg-lime px-4 pt-[23px] pb-[21px] flex items-baseline gap-3">
                  <span className="font-mono text-[13px] font-light uppercase tracking-[0.25em] text-neutral-600">Day {di + 1}</span>
                  <h2 className="font-heading font-medium tracking-[-0.03em] text-neutral-900 text-2xl leading-none">{format(parseISO(day), "EEEE, MMMM d")}</h2>
                </div>,
                ...dated.filter((i) => i.date === day).map(renderItem),
              ]}
            </CardStack>
          </div>
        </motion.div>
      ))}
      {undated.length > 0 && (
        <div className="lg:hidden">
          <h2 className="text-[13px] font-light uppercase tracking-widest text-white/70 mb-3">Anytime / Documents</h2>
          <DocumentsFolder items={undated} onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}