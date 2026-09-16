"use client";

import { Battery, CheckCircle2, Plane, VideoOff } from "lucide-react";
import type { CameraStatus } from "@/lib/hardware";
import type { AppSettings } from "@/lib/types";
import { cn } from "@/lib/cn";

export function StatusBar({
  camera,
  settings,
  offline,
}: {
  camera: CameraStatus;
  settings: AppSettings;
  offline: boolean;
}) {
  const cameraOk = camera === "ok";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-medium",
            cameraOk ? "text-emerald-400" : "text-amber-300",
          )}
        >
          {cameraOk ? <CheckCircle2 className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          {cameraOk ? "Camera OK" : camera === "denied" ? "Camera blocked" : "Demo camera"}
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-300">
          <Battery className="h-4 w-4" />
          Battery {settings.mockBatteryPct}%
        </span>
      </div>
      {offline && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
          <Plane className="h-3.5 w-3.5" />
          Offline mode
        </span>
      )}
    </div>
  );
}
