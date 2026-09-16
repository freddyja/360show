"use client";

import { RefreshCw } from "lucide-react";

export function BootScreen({ message = "Opening booth…" }: { message?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10">
          <RefreshCw className="h-7 w-7 animate-spin text-blue-400" />
        </div>
        <p className="text-sm tracking-[0.28em] text-slate-400 uppercase">360 Photo Booth</p>
        <p className="text-xl font-semibold text-white">{message}</p>
      </div>
    </div>
  );
}
