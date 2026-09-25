import React from "react";

// Boarding-pass style perforation between two joined day cards:
// white bridge covering the cards' rounded corners, side notches, dashed line.
export default function TicketSeam({ dimmed, bottomAccent }) {
  return (
    <div className={`relative z-10 h-6 -my-3 pointer-events-none ${dimmed ? "opacity-50" : ""}`} aria-hidden="true">
      <div className="absolute inset-x-0 top-0 h-1/2 bg-white" />
      <div className={`absolute inset-x-0 bottom-0 h-1/2 ${bottomAccent ? "bg-lime" : "bg-white"}`} />
      <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-black" />
      <div className="absolute -right-3 top-0 w-6 h-6 rounded-full bg-black" />
      <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 border-t border-dashed border-neutral-600" />
    </div>
  );
}