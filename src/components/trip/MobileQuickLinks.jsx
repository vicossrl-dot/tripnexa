import React from "react";
import { getCategory } from "./categories";

export default function MobileQuickLinks({ items, onSelect }) {
  const quick = items.filter((i) => ["flight", "stay", "document"].includes(i.category));
  if (quick.length === 0) return null;
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30">
      <div className="bg-lime/90 backdrop-blur-xl border-t border-white/40 rounded-t-3xl shadow-2xl px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="px-1.5 mb-2">
          <span className="text-sm font-medium text-neutral-900">Quick Links</span>
        </div>
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {quick.map((item) => {
            const Icon = getCategory(item).icon;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className="snap-start shrink-0 w-[42%] flex items-center gap-2.5 bg-white/50 rounded-full px-2 py-2 text-left active:bg-white/70 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-lime" />
                </div>
                <span className="text-sm font-medium text-neutral-900 leading-snug line-clamp-2">{item.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}