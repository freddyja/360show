"use client";

import Link from "next/link";
import { ArrowLeft, Heart, Maximize2, Play, RefreshCw, Sparkles } from "lucide-react";
import { capturePath, clipShareUrl } from "@/lib/shareUrl";
import { FrameOverlay, frameMediaClass } from "@/components/FrameOverlay";
import { QRCard } from "@/components/QRCard";
import { RampPlayer } from "@/components/RampPlayer";
import { ShareActions } from "@/components/ShareActions";
import { BootScreen } from "@/components/BootScreen";
import { useBooth, useEvent } from "@/lib/store";
import { rampProfileForFrame } from "@/lib/frames";
import { useClipSrc } from "@/lib/useClipSrc";
import { cn } from "@/lib/cn";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clipFromCloud,
  eventFromCloud,
  type CloudShare,
  type ShareConfig,
} from "@/lib/share/types";
import { fetchCloudShare, fetchShareConfig, publishClipToCloud } from "@/lib/share/publish";

export function GuestShareScreen({
  eventId,
  clipId,
  publicMode = false,
}: {
  eventId?: string;
  clipId: string;
  publicMode?: boolean;
}) {
  const { ready, clips, getBlob, settings, saveClip } = useBooth();
  const localClip = clips.find((item) => item.id === clipId);
  const resolvedEventId = eventId ?? localClip?.eventId;
  const { event: localEvent } = useEvent(resolvedEventId);
  const [cloud, setCloud] = useState<CloudShare | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [config, setConfig] = useState<ShareConfig | null>(null);
  const [publishState, setPublishState] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [status, setStatus] = useState("Ready");
  const publishOnce = useRef<string | null>(null);

  const clip = localClip ?? (cloud ? clipFromCloud(cloud) : undefined);
  const event = localEvent ?? (cloud ? eventFromCloud(cloud) : undefined);
  const remoteUrl = localClip?.remoteVideoUrl || cloud?.videoUrl || null;
  const src = useClipSrc(clip?.id, clip?.demoAssetPath, remoteUrl);
  const shareUrl = useMemo(
    () => clipShareUrl(clipId, config?.origin),
    [clipId, config?.origin],
  );
  const year = event?.date?.slice(0, 4) ?? "2026";
  const hudTop = event?.frameStyle === "christian-fellowship";
  const rampProfile = event ? rampProfileForFrame(event.frameStyle) : "time-ramp-v1";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nextConfig = await fetchShareConfig();
      if (!cancelled) setConfig(nextConfig);
      const nextCloud = await fetchCloudShare(clipId);
      if (!cancelled) {
        setCloud(nextCloud);
        setCloudReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clipId]);

  useEffect(() => {
    if (publicMode || !ready || !localClip || !localEvent || !config) return;
    if (settings.forceOffline) {
      setPublishState("Offline — clip stays on this tablet");
      return;
    }
    if (!config.blobConfigured) {
      setPublishState("Local-only share — add BLOB_READ_WRITE_TOKEN to upload for guest phones");
      return;
    }
    if (publishOnce.current === clipId) return;
    publishOnce.current = clipId;
    let cancelled = false;
    (async () => {
      try {
        setPublishState("Uploading to guest cloud…");
        const existing = await fetchCloudShare(localClip.id);
        const localBlob = await getBlob(localClip.id);
        const published = await publishClipToCloud({
          event: localEvent,
          clip: localClip,
          localBlob,
          existing: existing ?? (localClip.remoteVideoUrl
            ? { videoUrl: localClip.remoteVideoUrl, videoContentType: "video/webm" }
            : null),
        });
        if (cancelled) return;
        setCloud(published);
        await saveClip({
          ...localClip,
          remoteVideoUrl: published.videoUrl,
          cloudShareAt: Date.now(),
        });
        setPublishState("Live for guest phones");
      } catch (error) {
        publishOnce.current = null;
        if (!cancelled) {
          setPublishState(error instanceof Error ? error.message : "Cloud upload failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    publicMode,
    ready,
    localClip,
    localEvent,
    config,
    settings.forceOffline,
    clipId,
    getBlob,
    saveClip,
  ]);

  if (!ready || (!clip && !cloudReady)) {
    return <BootScreen message="Loading spin…" />;
  }

  if (!clip || !event) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-2xl font-semibold text-white">Clip not available</p>
          <p className="max-w-lg text-slate-400">
            {config && !config.blobConfigured
              ? "This clip lives on the booth tablet. Deploy with Vercel Blob (BLOB_READ_WRITE_TOKEN) so guest phones can load it."
              : "This share link has no cloud clip yet. Open Share on the booth after setting BLOB_READ_WRITE_TOKEN, or scan again after upload."}
          </p>
        </div>
      </Shell>
    );
  }

  const clipRecord = clip;
  const eventRecord = event;

  async function download() {
    const blob = await getBlob(clipRecord.id).catch(() => null);
    const file =
      blob ??
      (await fetch(remoteUrl || clipRecord.demoAssetPath || "/demo/spin.mp4")
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

  const readyLabel = publishState
    ? publishState
    : status === "Ready"
      ? settings.forceOffline
        ? "Ready · saved on this tablet"
        : "Ready"
      : status;

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
          <div className="relative aspect-video">
            <RampPlayer
              src={src}
              poster={clip.thumbnailDataUrl}
              className={cn("h-full w-full object-cover", frameMediaClass(event.frameStyle))}
              rampProfile={rampProfile}
              onPlayingChange={setPlaying}
            />
            <FrameOverlay style={event.frameStyle} names={event.clientNames} accentColor={event.accentColor} />
            <div
              className={cn(
                "absolute flex items-center gap-3 rounded-full bg-black/55 px-3 py-2 backdrop-blur-sm",
                hudTop ? "top-6 left-6" : "bottom-4 left-4",
              )}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500">
                <Play className="h-4 w-4 fill-white text-white" />
              </span>
              <span>
                <span className="block text-sm font-medium text-white">360° Spin</span>
                <span className="block text-xs text-slate-300">
                  {playing ? (rampProfile === "time-ramp-gentle" ? "Slow-mo" : "Playing") : "Freeze"}
                </span>
              </span>
            </div>
            <button
              type="button"
              className={cn(
                "absolute flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/40 text-white",
                hudTop ? "top-6 right-6" : "right-4 bottom-4",
              )}
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
          <p className="py-3 text-center text-sm text-blue-300">{readyLabel}</p>
        </div>
        <QRCard url={shareUrl} accentColor={event.accentColor} />
      </div>

      <div className="mt-4">
        <ShareActions
          url={shareUrl}
          onDownload={() => void download()}
          canDownload={Boolean(clip.hasBlob || clip.demoAssetPath || remoteUrl)}
        />
      </div>

      <footer className="mt-5 flex items-center justify-center gap-3 rounded-2xl border border-white/10 py-4 text-xl font-medium text-blue-300">
        <Heart className="h-5 w-5 fill-blue-400 text-blue-400" />
        {event.clientNames} · {year}
        <Heart className="h-5 w-5 fill-blue-400 text-blue-400" />
      </footer>
      {publicMode && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Guest phones load this clip from cloud storage when the booth has uploaded it. Use the
          deployed HTTPS URL in the QR, not a LAN IP.
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
