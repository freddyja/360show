"use client";

import Link from "next/link";
import { CloudOff, Share2 } from "lucide-react";
import { BootScreen } from "@/components/BootScreen";
import { OperatorShell } from "@/components/OperatorShell";
import { useBooth, useEvent } from "@/lib/store";
import { operatorSharePath } from "@/lib/shareUrl";

export function GalleryScreen({ eventId }: { eventId: string }) {
  const { ready, settings } = useBooth();
  const { event, eventClips } = useEvent(eventId);

  if (!ready) return <BootScreen />;

  return (
    <OperatorShell eventId={eventId}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-white">Gallery</h1>
          <p className="mt-1 text-slate-400">
            {event ? `${event.name} — ${event.clientNames}` : "Event"} · {eventClips.length} spin
            {eventClips.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
          <CloudOff className="h-3.5 w-3.5" />
          {settings.forceOffline ? "Offline" : "On this device"}
        </span>
      </div>

      {eventClips.length === 0 ? (
        <div className="mt-10 flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 text-center">
          <p className="text-xl text-white">No spins yet</p>
          <p className="mt-1 text-slate-400">Start a spin on Capture and it will land here.</p>
          <Link href={`/e/${eventId}/capture`} className="mt-5 rounded-full bg-blue-500 px-5 py-2 text-sm text-white">
            Go to Capture
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {eventClips.map((clip) => (
            <Link
              key={clip.id}
              href={operatorSharePath(eventId, clip.id)}
              className="overflow-hidden rounded-3xl border border-white/10 bg-[#0c1424]"
            >
              <div className="relative aspect-video bg-[#070b14]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={clip.thumbnailDataUrl || "/demo/poster.png"}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs text-slate-100">
                  {clip.source === "camera" ? "Camera" : "Demo"}
                </span>
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs text-slate-100">
                  <CloudOff className="h-3 w-3" /> Offline
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-white">
                    {new Date(clip.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-slate-400">
                    {clip.hasBakedBlob ? "Slow-mo baked" : "Ramp on preview · bake on save"}
                  </p>
                </div>
                <Share2 className="h-5 w-5 text-blue-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </OperatorShell>
  );
}
