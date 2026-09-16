"use client";

import Link from "next/link";
import { ArrowLeft, Heart, Maximize2, Play, RefreshCw, Sparkles } from "lucide-react";
import { capturePath } from "@/lib/shareUrl";
import { FrameOverlay } from "@/components/FrameOverlay";
import { QRCard } from "@/components/QRCard";
import { RampPlayer } from "@/components/RampPlayer";
import { ShareActions } from "@/components/ShareActions";
import { BootScreen } from "@/components/BootScreen";
import { useBooth, useEvent } from "@/lib/store";
import { clipShareUrl } from "@/lib/shareUrl";
import { useClipSrc } from "@/lib/useClipSrc";
import { useMemo, useState } from "react";

export function GuestShareScreen({
  eventId,
  clipId,
  publicMode = false,
}: {
  eventId?: string;
  clipId: string;
  publicMode?: boolean;
}) {
  const { ready, clips, getBlob, settings } = useBooth();
  const clip = clips.find((item) => item.id === clipId);
  const resolvedEventId = eventId ?? clip?.eventId;
  const { event } = useEvent(resolvedEventId);
  const src = useClipSrc(clip?.id, clip?.demoAssetPath);
  const [playing, setPlaying] = useState(true);
  const [status, setStatus] = useState("Ready");
  const shareUrl = useMemo(() => clipShareUrl(clipId), [clipId]);
  const year = event?.date?.slice(0, 4) ?? "2026";

  if (!ready) return <BootScreen message="Loading spin…" />;

  if (!clip || !event) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-2xl font-semibold text-white">Clip not on this device</p>
          <p className="max-w-lg text-slate-400">
            Guest phones only see this page if the booth is deployed with cloud storage. For
            local demos, open the QR on this tablet — production needs a public URL.
          </p>
        </div>
      </Shell>
    );
  }

  const clipRecord = clip;
  const eventRecord = event;

  async function download() {
    const blob = await getBlob(clipRecord.id);
    const file =
      blob ??
      (await fetch(clipRecord.demoAssetPath || "/demo/spin.mp4")
        .then((r) => r.blob())
        .catch(() => null));
    if (!file) {
      setStatus("Nothing to download");
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    const ext = file.type.includes("mp4") ? "mp4" : "webm";
    a.download = `${eventRecord.clientNames.replace(/\s+/g, "-")}-360-spin.${ext}`;
    a.click();
    setStatus("Saved on this device");
  }

  return (
    <Shell>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm tracking-[0.22em] text-slate-300 uppercase">
          {!publicMode && event && (
            <Link
              href={capturePath(event.id)}
              className="mr-1 inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[11px] tracking-normal text-slate-300 normal-case"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Booth
            </Link>
          )}
          <RefreshCw className="h-5 w-5 text-blue-400" />
          360 Photo Booth
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="tracking-[0.18em] text-slate-400 uppercase">Guest Share</span>
          <span className="h-4 w-px bg-white/20" />
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-blue-200">
            <Sparkles className="h-3.5 w-3.5" />
            Just spun!
          </span>
        </div>
      </header>

      <div className="mt-5 grid flex-1 gap-4 lg:grid-cols-[1.35fr_0.9fr]">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#0c1424]">
          <div className="relative aspect-video h-full min-h-[240px]">
            <RampPlayer
              src={src}
              poster={clip.thumbnailDataUrl}
              className="h-full w-full object-cover"
              onPlayingChange={setPlaying}
            />
            <FrameOverlay style={event.frameStyle} names={event.clientNames} accentColor={event.accentColor} />
            <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full bg-black/55 px-3 py-2 backdrop-blur-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500">
                <Play className="h-4 w-4 fill-white text-white" />
              </span>
              <span>
                <span className="block text-sm font-medium text-white">360° Spin</span>
                <span className="block text-xs text-slate-300">{playing ? "Playing" : "Freeze"}</span>
              </span>
            </div>
            <button
              type="button"
              className="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/40 text-white"
              aria-label="Fullscreen"
              onClick={() => {
                const node = document.documentElement;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void node.requestFullscreen?.();
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          <p className="py-3 text-center text-sm text-blue-300">
            {status === "Ready" ? (settings.forceOffline ? "Ready · saved on this tablet" : "Ready") : status}
          </p>
        </div>
        <QRCard url={shareUrl} accentColor={event.accentColor} />
      </div>

      <div className="mt-4">
        <ShareActions url={shareUrl} onDownload={() => void download()} canDownload={clip.hasBlob || Boolean(clip.demoAssetPath)} />
      </div>

      <footer className="mt-5 flex items-center justify-center gap-3 rounded-2xl border border-white/10 py-4 text-xl font-medium text-blue-300">
        <Heart className="h-5 w-5 fill-blue-400 text-blue-400" />
        {event.clientNames} · {year}
        <Heart className="h-5 w-5 fill-blue-400 text-blue-400" />
      </footer>
      {publicMode && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Local demo: this page reads IndexedDB on the booth tablet. Deploy with a public origin for guest phones.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#05080f] p-3 sm:p-4 md:p-5">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-[1400px] flex-col rounded-[28px] border border-white/10 bg-[#0a101c] p-4 sm:p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}
