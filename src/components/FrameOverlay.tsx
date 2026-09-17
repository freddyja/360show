"use client";

import type { FrameStyleId } from "@/lib/types";
import { frameCaptionLayout, getFrameStyle } from "@/lib/frames";
import { cn } from "@/lib/cn";

export function frameMediaClass(style: FrameStyleId) {
  if (style === "gold-oval") {
    return "[clip-path:ellipse(44%_38%_at_50%_50%)]";
  }
  return "";
}

export function FrameOverlay({
  style,
  names,
  accentColor,
}: {
  style: FrameStyleId;
  names: string;
  accentColor: string;
}) {
  const pack = getFrameStyle(style);
  if (pack.assetSrc) {
    const caption = frameCaptionLayout(style);
    return (
      <div className="pointer-events-none absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pack.assetSrc}
          alt={pack.caption ?? pack.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {caption && (
          <p
            className="absolute left-1/2 max-w-[78%] -translate-x-1/2 -translate-y-1/2 truncate text-center text-sm font-semibold uppercase sm:text-lg"
            style={{
              top: `${caption.y * 100}%`,
              color: caption.color,
              letterSpacing: caption.tracking,
              transform: `translate(-50%, -50%)${caption.rotateDeg ? ` rotate(${caption.rotateDeg}deg)` : ""}`,
            }}
          >
            {names}
          </p>
        )}
      </div>
    );
  }

  if (style === "gold-oval") {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[76%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[10px] border-[#d4af37] shadow-[0_0_0_4px_#1a1408,inset_0_0_0_2px_rgba(248,231,160,0.7)]" />
        <span className="absolute left-[6%] top-[12%] h-10 w-10 rounded-tl-[18px] border-l-[6px] border-t-[6px] border-[#f0d47a]" />
        <span className="absolute right-[6%] top-[12%] h-10 w-10 rounded-tr-[18px] border-r-[6px] border-t-[6px] border-[#f0d47a]" />
        <span className="absolute bottom-[12%] left-[6%] h-10 w-10 rounded-bl-[18px] border-b-[6px] border-l-[6px] border-[#f0d47a]" />
        <span className="absolute right-[6%] bottom-[12%] h-10 w-10 rounded-br-[18px] border-b-[6px] border-r-[6px] border-[#f0d47a]" />
      </div>
    );
  }

  if (style === "neon-ring") {
    return (
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid meet"
      >
        <ellipse cx="800" cy="640" rx="520" ry="140" fill="none" stroke={accentColor} strokeWidth="10" />
        <ellipse cx="800" cy="640" rx="490" ry="118" fill="none" stroke={accentColor} strokeWidth="3" opacity="0.45" />
      </svg>
    );
  }

  if (style === "midnight-arch") {
    return (
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d="M140 820 V 360 Q 800 40 1460 360 V 820"
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="12"
        />
        <circle cx="180" cy="120" r="5" fill={accentColor} />
        <circle cx="1420" cy="120" r="5" fill={accentColor} />
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

  return <div className={cn("pointer-events-none absolute inset-3 rounded-2xl border border-white/40")} />;
}
