import React from "react";
import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Folder from "@/components/Folder";

export default function DocumentsFolder({ items, onSelect, align = "center" }) {
  const navigate = useNavigate();
  const tripId = items[0]?.trip_id;

  const papers = items.slice(0, 3).map((item) => (
    <div
      key={item.id}
      className="w-full h-full flex flex-col items-center justify-center gap-1 px-1.5 text-center pointer-events-none"
      title={item.title}
    >
      <FileText className="w-4 h-4 text-neutral-700 shrink-0" />
      <span className="text-[8px] font-medium leading-tight text-neutral-800 line-clamp-2">{item.title}</span>
    </div>
  ));

  return (
    <div className={`flex flex-col gap-3 ${align === "left" ? "items-start pb-2" : "items-center pt-20 pb-2"}`}>
      <Folder
        size={0.72}
        color="#ffbca4"
        items={papers}
        openDirection={align === "left" ? "right" : "up"}
        className={align === "left" ? "origin-top-left mt-[8px]" : ""}
        onOpen={() => tripId && navigate(`/trip/${tripId}/documents`)}
      />
      <p className="mt-4 text-[13px] font-light uppercase tracking-[0.25em] text-white/85">
        {items.length} document{items.length === 1 ? "" : "s"} · Click to view all
      </p>
    </div>
  );
}