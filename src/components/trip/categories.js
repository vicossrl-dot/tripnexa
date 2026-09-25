import { Plane, BedDouble, MapPin, FileText, TrainFront, Ship, Bus } from "lucide-react";

export const CATEGORIES = {
  flight: { label: "Flight", icon: Plane, badge: "bg-neutral-800 text-white", soft: "bg-neutral-800 text-white" },
  stay: { label: "Stay / Hotel", icon: BedDouble, badge: "bg-neutral-800 text-white", soft: "bg-neutral-800 text-white" },
  place: { label: "Places to visit / Tickets", icon: MapPin, badge: "bg-neutral-800 text-white", soft: "bg-neutral-800 text-white" },
  document: { label: "Documents", icon: FileText, badge: "bg-neutral-800 text-white", soft: "bg-neutral-800 text-white" },
};

// Resolves the display category for an item — transport items (category "flight")
// get a matching icon/label based on their title (train, ferry, bus).
export function getCategory(item) {
  const base = CATEGORIES[item.category];
  if (item.category !== "flight") return base;
  const t = (item.title || "").toLowerCase();
  if (/\btrain|rail|treno\b/.test(t)) return { ...base, label: "Train", icon: TrainFront };
  if (/\bferry|boat|vaporetto|traghetto\b/.test(t)) return { ...base, label: "Ferry", icon: Ship };
  if (/\bbus|coach|shuttle\b/.test(t)) return { ...base, label: "Bus", icon: Bus };
  return base;
}

export const FILTERS = [
  { key: "all", label: "All" },
  { key: "flight", label: "Transport" },
  { key: "stay", label: "Stays" },
  { key: "place", label: "Places" },
  { key: "document", label: "Docs" },
];
