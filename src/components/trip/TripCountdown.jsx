import React, { useState, useEffect } from "react";

export default function TripCountdown({ target, dark = false }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const diff = Math.max(0, new Date(target).getTime() - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");

  const units = [
    { v: days, l: "Days" },
    { v: pad(hours), l: "Hrs" },
    { v: pad(mins), l: "Min" },
    { v: pad(secs), l: "Sec" },
  ];

  return (
    <div className="flex items-center gap-3">
      {units.map((u, i) => (
        <React.Fragment key={u.l}>
          {i > 0 && <span className={`font-heading text-xl -mt-4 ${dark ? "text-neutral-300" : "text-white/40"}`}>:</span>}
          <div className="text-center">
            <span className={`font-heading font-medium text-3xl sm:text-4xl tabular-nums leading-none ${dark ? "text-neutral-900" : "text-white"}`}>{u.v}</span>
            <p className={`mt-1 text-[13px] font-light uppercase tracking-[0.25em] ${dark ? "text-neutral-600" : "text-white"}`}>{u.l}</p>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}