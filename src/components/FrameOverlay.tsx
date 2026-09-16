"use client";

import type { FrameStyleId } from "@/lib/types";

export function FrameOverlay({
  style,
  names,
  accentColor,
}: {
  style: FrameStyleId;
  names: string;
  accentColor: string;
}) {
  if (style === "gold-oval") {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 620" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f6e27a" />
            <stop offset="50%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#f3d67a" />
          </linearGradient>
        </defs>
        <ellipse cx="500" cy="310" rx="430" ry="250" fill="none" stroke="url(#gold)" strokeWidth="18" />
        <ellipse cx="500" cy="310" rx="410" ry="232" fill="none" stroke="#1a1408" strokeWidth="6" />
        <path d="M70 90 C 110 40, 170 55, 180 95" fill="none" stroke="url(#gold)" strokeWidth="8" />
        <path d="M930 90 C 890 40, 830 55, 820 95" fill="none" stroke="url(#gold)" strokeWidth="8" />
        <path d="M70 530 C 110 580, 170 565, 180 525" fill="none" stroke="url(#gold)" strokeWidth="8" />
        <path d="M930 530 C 890 580, 830 565, 820 525" fill="none" stroke="url(#gold)" strokeWidth="8" />
      </svg>
    );
  }

  if (style === "neon-ring") {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 620" preserveAspectRatio="none">
        <ellipse cx="500" cy="430" rx="320" ry="90" fill="none" stroke={accentColor} strokeWidth="8" opacity="0.9" />
        <ellipse cx="500" cy="430" rx="300" ry="76" fill="none" stroke={accentColor} strokeWidth="3" opacity="0.4" />
        <circle cx="500" cy="310" r="4" fill={accentColor} />
      </svg>
    );
  }

  if (style === "midnight-arch") {
    return (
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 620" preserveAspectRatio="none">
        <path
          d="M80 560 V 240 Q 500 20 920 240 V 560"
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="10"
        />
        <circle cx="90" cy="90" r="4" fill={accentColor} />
        <circle cx="910" cy="90" r="4" fill={accentColor} />
        <circle cx="140" cy="60" r="2" fill="white" />
        <circle cx="860" cy="70" r="2" fill="white" />
      </svg>
    );
  }

  if (style === "classic-plaque") {
    return (
      <div className="pointer-events-none absolute inset-x-6 bottom-5">
        <div className="rounded-2xl border border-amber-200/40 bg-black/55 px-4 py-2 text-center backdrop-blur-sm">
          <p className="text-sm tracking-[0.2em] text-amber-100 uppercase">{names}</p>
        </div>
      </div>
    );
  }

  return <div className="pointer-events-none absolute inset-3 rounded-2xl border border-white/40" />;
}
