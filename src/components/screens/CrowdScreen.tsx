"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Volume2, VolumeX } from "lucide-react";
import { BootScreen } from "@/components/BootScreen";
import { FrameOverlay, frameMediaClass } from "@/components/FrameOverlay";
import { RampPlayer } from "@/components/RampPlayer";
import { getBakedBlob } from "@/lib/db";
import { bakedBlobKey } from "@/lib/capture/bake";
import { readCrowd, subscribeCrowd, type CrowdNowPlaying, type CrowdPhase } from "@/lib/crowd/channel";
import { isDrivePlaybackUrl } from "@/lib/drive/urls";
import { frameBakeId, rampProfileForFrame } from "@/lib/frames";
import { musicBedId } from "@/lib/music/beds";
import { exportMusicId } from "@/lib/music/custom";
import { fetchCloudShare } from "@/lib/share/publish";
import { capturePath, clipShareUrl } from "@/lib/shareUrl";
import { clipFromCloud, type CloudShare } from "@/lib/share/types";
import { useBooth, useEvent } from "@/lib/store";
import { useClipSrc } from "@/lib/useClipSrc";
import { cn } from "@/lib/cn";

export function CrowdScreen({ eventId }: { eventId: string }) {
  const { ready, refresh, settings, clips } = useBooth();
  const { event, latestClip, eventClips } = useEvent(eventId);
  const [live, setLive] = useState<CrowdNowPlaying | null>(null);
  const [hintClipId, setHintClipId] = useState<string | null>(null);
  const [cloud, setCloud] = useState<CloudShare | null>(null);
  const [unmuted, setUnmuted] = useState(false);
  const videoWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setHintClipId(q.get("c"));
  }, []);

  useEffect(() => subscribeCrowd(eventId, setLive), [eventId]);

  useEffect(() => {
    const tick = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(tick);
  }, [refresh]);

  useEffect(() => {
    setLive((prev) => prev ?? readCrowd(eventId));
  }, [eventId]);

  const phaseClipId = live?.clipId || latestClip?.id || hintClipId;
  const localClip = useMemo(
    () => clips.find((item) => item.id === phaseClipId) ?? latestClip ?? eventClips[0] ?? null,
    [clips, phaseClipId, latestClip, eventClips],
  );

  useEffect(() => {
    if (!phaseClipId || localClip?.hasBlob) {
      setCloud(null);
      return;
    }
    let cancelled = false;
    void fetchCloudShare(phaseClipId).then((next) => {
      if (!cancelled) setCloud(next);
    });
    return () => {
      cancelled = true;
    };
  }, [phaseClipId, localClip?.hasBlob]);

  const remoteUrl = localClip?.remoteVideoUrl || live?.remoteVideoUrl || cloud?.videoUrl || null;
  const originalSrc = useClipSrc(localClip?.id, localClip?.demoAssetPath || cloud?.demoAssetPath, remoteUrl);
  const [bakedSrc, setBakedSrc] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let url: string | null = null;
    (async () => {
      if (!localClip || !event) {
        setBakedSrc(null);
        return;
      }
      const musicId = exportMusicId(event) || musicBedId(event.musicBedLabel);
      const key = bakedBlobKey(
        localClip.id,
        musicId,
        settings.slowMoEnabled !== false,
        frameBakeId(event.frameStyle),
      );
      try {
        const blob = await getBakedBlob(localClip.id, key);
        if (revoked) return;
        if (blob && blob.size > 500) {
          url = URL.createObjectURL(blob);
          setBakedSrc(url);
          return;
        }
      } catch {
        // no baked file yet
      }
      if (!revoked) setBakedSrc(null);
    })();
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [localClip, event, settings.slowMoEnabled]);

  const src = bakedSrc || originalSrc;
  const cloudClip = cloud ? clipFromCloud(cloud) : null;
  const clip = localClip || cloudClip;
  const names = event?.clientNames || cloud?.clientNames || "Guests";
  const accent = event?.accentColor || cloud?.accentColor || "#22d3ee";
  const frameStyle = event?.frameStyle || cloud?.frameStyle || "gold-oval";
  const hasLocalOriginal = Boolean(localClip && (localClip.hasBlob || localClip.demoAssetPath));
  const playingBakedFile = Boolean(bakedSrc) || Boolean((cloud?.baked || remoteUrl) && !hasLocalOriginal && clip);
  const liveRamp = hasLocalOriginal && !bakedSrc && settings.slowMoEnabled !== false;
  const showWebFrame = !playingBakedFile;
  const phase: CrowdPhase = live?.phase || (clip ? "ready" : "idle");
  const spinning = phase === "countdown" || phase === "recording" || phase === "processing";
  const shareUrl = clip ? clipShareUrl(clip.id) : "";

  if (!ready) return <BootScreen />;

  return (
    <div className="booth-page relative min-h-dvh overflow-hidden p-0">
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative flex min-h-dvh flex-col px-4 py-4 sm:px-8 sm:py-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm tracking-[0.28em] text-cyan-200 uppercase">360 Photo Booth</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white drop-shadow sm:text-5xl md:text-6xl">
              {event?.name || cloud?.eventName || "Tonight’s Event"}
            </h1>
            <p className="mt-2 text-xl text-white/90 sm:text-3xl md:text-4xl">{names}</p>
          </div>
          <Link
            href={capturePath(eventId)}
            className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs text-slate-200"
          >
            Booth
          </Link>
        </header>

        <div
          ref={videoWrap}
          className="relative mx-auto mt-4 flex min-h-0 w-full max-w-[1600px] flex-1 items-center justify-center"
        >
          {clip && src ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_0_80px_rgba(255,45,149,0.25)]">
              <RampPlayer
                src={src}
                poster={clip.thumbnailDataUrl}
                className={cn("h-full w-full object-cover", showWebFrame ? frameMediaClass(frameStyle) : "")}
                rampProfile={rampProfileForFrame(frameStyle)}
                liveRamp={liveRamp}
                allowSound
              />
              {showWebFrame && (
                <FrameOverlay style={frameStyle} names={names} accentColor={accent} />
              )}
              {spinning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45">
                  <p className="text-6xl font-semibold text-white sm:text-8xl">
                    {phase === "countdown" ? live?.count ?? 3 : phase === "recording" ? "SPINNING" : "SAVING"}
                  </p>
                </div>
              )}
              <button
                type="button"
                className="absolute right-4 bottom-4 z-10 inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white"
                onClick={() => {
                  const next = !unmuted;
                  setUnmuted(next);
                  const node = videoWrap.current?.querySelector("video");
                  if (node) {
                    node.muted = !next;
                    void node.play().catch(() => undefined);
                  }
                }}
              >
                {unmuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {unmuted ? "Sound on" : "Tap for sound"}
              </button>
            </div>
          ) : (
            <IdleHero names={names} accent={accent} phase={phase} count={live?.count} />
          )}
        </div>

        <footer className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-xl text-sm text-white/70 sm:text-base">
            {spinning
              ? phase === "countdown"
                ? "Hold still — capture starting"
                : phase === "recording"
                  ? "Spinning now"
                  : "Saving this spin…"
              : clip
                ? "Latest spin · looping for the room"
                : "Waiting for the next spin. Cast this booth tablet to the TV, or open the link in another tab of the same browser. A second phone without the booth session only sees a clip after Share uploads it (Copy TV link includes ?c=)."}
          </p>
          {clip && shareUrl && !isDrivePlaybackUrl(src) && (
            <div className="rounded-2xl bg-white p-2">
              <QRCodeSVG value={shareUrl} size={92} bgColor="#ffffff" fgColor="#07101c" />
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

function IdleHero({
  names,
  accent,
  phase,
  count,
}: {
  names: string;
  accent: string;
  phase: CrowdPhase;
  count?: number;
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center text-center">
      <div className="mb-6 h-2 w-32 rounded-full sm:w-48" style={{ backgroundColor: accent }} />
      <p className="text-6xl font-semibold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.55)] sm:text-8xl md:text-9xl">
        {phase === "countdown" && (count ?? 3)}
        {phase === "recording" && "SPINNING"}
        {phase === "processing" && "SAVING"}
        {(phase === "idle" || phase === "ready") && "NEXT SPIN"}
      </p>
      <p className="mt-4 text-2xl text-white/85 sm:text-4xl">{names}</p>
      {(phase === "idle" || phase === "ready") && (
        <p className="mt-3 text-lg tracking-[0.2em] text-cyan-100 uppercase sm:text-xl">Step onto the platform</p>
      )}
    </div>
  );
}
