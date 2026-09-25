import React from "react";

// Boarding-pass perforation BETWEEN item rows inside an open day card:
// side notches cut into the white card + a dashed line across.
export default function RowSeam() {
  return (
    <div className="relative h-6 pointer-events-none" aria-hidden="true">
      <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-black" />
      <div className="absolute -right-3 top-0 w-6 h-6 rounded-full bg-black" />
      <div className="absolute left-5 right-5 top-1/2 -translate-y-1/2 border-t border-dashed border-neutral-900" />
    </div>
  );
}