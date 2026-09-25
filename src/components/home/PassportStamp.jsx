import React from "react";

// Passport-style ink stamp shown over trips that already ended
export default function PassportStamp({ date }) {
  const year = date ? new Date(date).getFullYear() : "";
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <svg
        viewBox="0 0 120 120"
        className="w-[110px] h-[110px] -rotate-[14deg] text-red-500/90 drop-shadow-[0_0_2px_rgba(0,0,0,0.4)]"
        style={{ filter: "url(#stamp-rough)" }}
      >
        <defs>
          <filter id="stamp-rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" />
          </filter>
          <path id="stamp-arc-top" d="M 60,60 m -44,0 a 44,44 0 1,1 88,0" fill="none" />
          <path id="stamp-arc-bottom" d="M 60,60 m -44,0 a 44,44 0 1,0 88,0" fill="none" />
        </defs>
        <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text fill="currentColor" fontSize="11" fontWeight="800" letterSpacing="3" fontFamily="var(--font-heading)">
          <textPath href="#stamp-arc-top" startOffset="50%" textAnchor="middle">TRIPSYNC</textPath>
        </text>
        <text fill="currentColor" fontSize="9" fontWeight="700" letterSpacing="2" fontFamily="var(--font-heading)">
          <textPath href="#stamp-arc-bottom" startOffset="50%" textAnchor="middle">✈ ✈ ✈</textPath>
        </text>
        <text x="60" y="57" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="900" letterSpacing="1.5" fontFamily="var(--font-heading)">COMPLETED</text>
        <text x="60" y="72" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="700" letterSpacing="1" fontFamily="var(--font-heading)">{year}</text>
      </svg>
    </div>
  );
}