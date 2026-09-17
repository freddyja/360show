"use client";

import { useState } from "react";
import { Copy, Tv } from "lucide-react";
import { crowdPath, crowdUrl } from "@/lib/crowd/channel";
import { cn } from "@/lib/cn";

export function CrowdOpenControls({
  eventId,
  clipId,
  className,
}: {
  eventId: string;
  clipId?: string | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const path = crowdPath(eventId, clipId);
  const url = typeof window === "undefined" ? path : crowdUrl(eventId, window.location.origin, clipId);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-500 px-4 text-sm font-medium text-white"
        onClick={() => window.open(path, "360show-crowd")}
      >
        <Tv className="h-4 w-4" />
        Open crowd / TV screen
      </button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-slate-200"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copy crowd / TV link", url);
          }
        }}
      >
        <Copy className="h-4 w-4" />
        {copied ? "Copied" : "Copy TV link"}
      </button>
    </div>
  );
}
