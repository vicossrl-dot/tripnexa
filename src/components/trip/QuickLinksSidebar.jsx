import React, { useState } from "react";
import { ExternalLink, Zap, ChevronDown } from "lucide-react";
import { getCategory } from "./categories";

export default function QuickLinksSidebar({ items, onSelect }) {
  const quick = items.filter((i) => ["flight", "stay", "document"].includes(i.category));
  const [open, setOpen] = useState(false);
  return (
    <aside className="hidden lg:block lg:w-72 shrink-0">
      <div className="lg:sticky lg:top-[86px] lg:mt-[42.5px]">
        <div className="bg-lime rounded-xl p-4 shadow-xl">
          <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2">
            <Zap className="w-4 h-4 text-neutral-900" />
            <h2 className="flex-1 text-left text-[13px] font-bold uppercase tracking-widest text-neutral-800">Quick Links</h2>
            <ChevronDown className={`w-4 h-4 text-neutral-900 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            quick.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-800/70 px-1 pb-1">Your flights, stays & documents will show up here for 1-tap access.</p>
            ) : (
              <div className="mt-4 space-y-1.5">
                {quick.map((item) => {
                  const Icon = getCategory(item).icon;
                  return (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <button
                        onClick={() => onSelect(item)}
                        className="flex-1 min-w-0 flex items-center gap-3 rounded-full px-3 py-2.5 text-left hover:bg-black/10 transition-colors"
                      >
                        <Icon className="w-4 h-4 text-neutral-900 shrink-0" />
                        <span className="text-sm text-neutral-900 truncate">{item.title}</span>
                      </button>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-full text-neutral-700 hover:text-neutral-900 hover:bg-black/10 transition-colors shrink-0"
                          title="Open link"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </aside>
  );
}