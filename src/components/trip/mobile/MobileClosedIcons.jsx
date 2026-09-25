import React from "react";
import { getCategory } from "@/components/trip/categories";

// Closed-day preview: the items' category icons, first one in front and the
// rest stacked behind it to the right. The first icon sits at the EXACT spot
// the first row's icon occupies when the card opens — so opening never jumps.
export default function MobileClosedIcons({ items, accent }) {
  const shown = items.slice(0, 4);
  return (
    <div className="py-1.5">
      <div className="px-5 py-3 flex items-center">
        {shown.map((item, i) => {
          const Icon = getCategory(item).icon;
          return (
            <div
              key={item.id}
              style={{ zIndex: shown.length - i }}
              className={`relative w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0 ${
                i > 0 ? "-ml-4 ring-2 ring-white" : ""
              }`}
            >
              <Icon className="w-[18px] h-[18px] text-white" />
            </div>
          );
        })}
        {/* one-line summary of the day's places — whatever fits, then … */}
        <p className={`ml-3.5 flex-1 min-w-0 truncate text-[14px] ${accent ? "text-neutral-700" : "text-neutral-400"}`}>
          {items.map((i) => i.title).join(" · ")}
        </p>
      </div>
    </div>
  );
}