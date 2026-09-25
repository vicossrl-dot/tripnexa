import React from "react";
import { Minus, Plus } from "lucide-react";

export default function Stepper({ value, onChange, min = 0, max = 99, step = 1, className = "" }) {
  const val = value || 0;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, val - step))}
        disabled={val <= min}
        className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors shrink-0"
      >
        <Minus className="w-4 h-4" />
      </button>
      <input
        type="number"
        value={val}
        onChange={(e) => {
          const n = parseInt(e.target.value) || 0;
          if (n >= min && n <= max) onChange(n);
          else if (n < min) onChange(min);
          else if (n > max) onChange(max);
        }}
        className="w-14 text-center bg-white/5 border border-white/10 rounded-lg text-white font-semibold py-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, val + step))}
        disabled={val >= max}
        className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors shrink-0"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}