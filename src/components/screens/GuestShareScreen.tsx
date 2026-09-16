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
import { fetchCloudShare, fetchShareConfig, publishClipToCloud, publishClipToDrive } from "@/lib/share/publish";
import {
  bakeSourceForClip,
  ensureBakedClip,
  extensionForBlob,
  triggerBlobDownload,
} from "@/lib/capture/ensureBaked";
import { driveDownloadUrl, drivePreviewUrl, driveViewUrl, isDrivePlaybackUrl } from "@/lib/drive/urls";
import { clipFromCloud, eventFromCloud, isFrameStyleId, type CloudShare, type ShareConfig } from "@/lib/share/types";

export function GuestShareScreen({
  eventId,
  clipId,
  publicMode = false,
}: {
  eventId?: string;
  clipId: string;
  publicMode?: boolean;
}) {
  const { ready, clips, getBlob, settings, patchClip } = useBooth();
  const localClip = clips.find((item) => item.id === clipId);
  const resolvedEventId = eventId ?? localClip?.eventId;
  const { event: localEvent } = useEvent(resolvedEventId);
  const [queryCloud, setQueryCloud] = useState<CloudShare | null>(null);
  const [cloud, setCloud] = useState<CloudShare | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [config, setConfig] = useState<ShareConfig | null>(null);
  const [publishState, setPublishState] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [status, setStatus] = useState("Ready");
  const publishOnce = useRef<string | null>(null);

  const resolvedCloud = cloud ?? queryCloud;
  const clip = localClip ?? (resolvedCloud ? clipFromCloud(resolvedCloud) : undefined);
  const event = localEvent ?? (resolvedCloud ? eventFromCloud(resolvedCloud) : undefined);
  const remoteUrl = localClip?.remoteVideoUrl || resolvedCloud?.videoUrl || null;
  const src = useClipSrc(clip?.id, clip?.demoAssetPath, remoteUrl);
  const destination = settings.cloudDestination || "blob";
  const shareUrl = useMemo(
    () => guestShareLink(clipId, config, resolvedCloud, event),
    [clipId, config, resolvedCloud, event],
  );
  const year = event?.date?.slice(0, 4) ?? "2026";
  const hudTop = event?.frameStyle === "christian-fellowship";
  const rampProfile = event ? rampProfileForFrame(event.frameStyle) : "time-ramp-v1";
  const liveRamp = Boolean(localClip) || (!resolvedCloud?.baked && !isDrivePlaybackUrl(src));
  const downloading = useRef(false);

  useEffect(() => {
    setQueryCloud(cloudFromQuery(clipId));
  }, [clipId]);

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
    if (destination === "blob" && !config.blobConfigured) {
      setPublishState("Local-only share — add BLOB_READ_WRITE_TOKEN to upload for guest phones");
      return;
    }
    if (destination === "drive" && !config.driveConfigured) {
      setPublishState("Google Drive is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
      return;
    }
    if (destination === "drive" && !config.driveConnected) {
      setPublishState("Connect Google Drive in Settings, then open Share again");
      return;
    }
    const publishKey = `${clipId}:${destination}`;
    if (publishOnce.current === publishKey) return;
    publishOnce.current = publishKey;
    let cancelled = false;
    const clipToPublish = localClip;
    const eventToPublish = localEvent;
    (async () => {
      try {
        setPublishState("Baking slow-mo export…");
        const sourceBlob = await getBlob(clipToPublish.id);
        const baked = await ensureBakedClip({
          clip: clipToPublish,
          source: bakeSourceForClip(clipToPublish, sourceBlob),
          onProgress: (progress) => {
            if (!cancelled) setPublishState(`Baking slow-mo… ${Math.round(progress * 100)}%`);
          },
        });
        if (cancelled) return;
        setPublishState(destination === "drive" ? "Uploading to Google Drive…" : "Uploading to guest cloud…");
        const existing = await fetchCloudShare(clipToPublish.id);
        const published =
          destination === "drive"
            ? await publishClipToDrive({
                event: eventToPublish,
                clip: clipToPublish,
                localBlob: baked,
                folderName: settings.driveFolderName || "360show",
                existing,
              })
            : await publishClipToCloud({
                event: eventToPublish,
                clip: clipToPublish,
                localBlob: baked,
                existing,
              });
        if (cancelled) return;
        setCloud(published);
        await patchClip(clipToPublish.id, {
          hasBakedBlob: true,
          bakedAt: Date.now(),
          remoteVideoUrl: published.videoUrl,
          cloudShareAt: Date.now(),
        });
        setPublishState(destination === "drive" ? "Live on Google Drive" : "Live for guest phones");
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
    // localClip / localEvent objects are read once per clip id so a bake metadata
    // saveClip does not cancel an in-flight upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicMode,
    ready,
    localClip?.id,
    localEvent?.id,
    config,
    settings.forceOffline,
    settings.driveFolderName,
    destination,
    clipId,
    getBlob,
    patchClip,
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
            {destination === "drive"
              ? "This clip is not in cloud storage yet. On the booth, connect Google Drive in Settings, then open Share."
              : config && !config.blobConfigured
                ? "This clip lives on the booth tablet. Deploy with Vercel Blob (BLOB_READ_WRITE_TOKEN) or connect Google Drive in Settings so guest phones can load it."
                : "This share link has no cloud clip yet. Open Share on the booth after connecting storage, or scan again after upload."}
          </p>
        </div>
      </Shell>
    );
  }

  async function download() {
    if (downloading.current) return;
    downloading.current = true;
    setStatus("Preparing slow-mo file…");
    try {
      const clipRecord = clip;
      const eventRecord = event;
      if (!clipRecord || !eventRecord) {
        setStatus("Nothing to download");
        return;
      }

      let file: Blob | null = null;
      if (publicMode && resolvedCloud?.destination === "drive" && resolvedCloud.driveFileId) {
        window.open(driveDownloadUrl(resolvedCloud.driveFileId), "_blank", "noopener,noreferrer");
        setStatus("Opened Google Drive download");
        return;
      }
      if (publicMode && resolvedCloud?.baked && remoteUrl && !isDrivePlaybackUrl(remoteUrl)) {
        file = await fetch(remoteUrl).then((res) => res.blob());
      } else {
        const sourceBlob = await getBlob(clipRecord.id).catch(() => null);
        const source =
          sourceBlob && sourceBlob.size > 500
            ? sourceBlob
            : remoteUrl && !resolvedCloud?.baked
              ? remoteUrl
              : bakeSourceForClip(clipRecord, sourceBlob);
        file = await ensureBakedClip({
          clip: clipRecord,
          source,
          onProgress: (progress) => setStatus(`Baking slow-mo… ${Math.round(progress * 100)}%`),
        });
        if (localClip) {
          await patchClip(localClip.id, {
            hasBakedBlob: true,
            bakedAt: Date.now(),
          });
        }
      }

      if (!file || file.size < 100) {
        setStatus("Nothing to download");
        return;
      }
      const ext = extensionForBlob(file);
      const base = eventRecord.clientNames.replace(/\s+/g, "-") || "360-spin";
      triggerBlobDownload(file, `${base}-360-spin-slowmo.${ext}`);
      setStatus("Saved baked slow-mo");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Download failed");
    } finally {
      downloading.current = false;
    }
  }

  const readyLabel =
    status !== "Ready"
      ? status
      : publishState
        ? publishState
        : settings.forceOffline
          ? "Ready · saved on this tablet"
          : "Ready";

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
              liveRamp={liveRamp}
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
                  {playing
                    ? liveRamp
                      ? rampProfile === "time-ramp-gentle"
                        ? "Slow-mo"
                        : "Playing"
                      : "Baked slow-mo"
                    : "Freeze"}
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
          canDownload={Boolean(clip.hasBlob || clip.demoAssetPath || remoteUrl || resolvedCloud?.driveFileId)}
        />
      </div>

      <footer className="mt-5 flex items-center justify-center gap-3 rounded-2xl border border-white/10 py-4 text-xl font-medium text-blue-300">
        <Heart className="h-5 w-5 fill-blue-400 text-blue-400" />
        {event.clientNames} · {year}
        <Heart className="h-5 w-5 fill-blue-400 text-blue-400" />
      </footer>
      {publicMode && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Guest phones load this clip from Vercel Blob or Google Drive when the booth has uploaded
          it. Use the deployed HTTPS URL in the QR, not a LAN IP. Downloads are ramp-baked; the frame
          stays as a web overlay.
        </p>
      )}
    </Shell>
  );
}

function cloudFromQuery(clipId: string): CloudShare | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const driveFileId = q.get("d");
  if (!driveFileId) return null;
  const names = q.get("n") || "360 spin";
  const frame = q.get("f");
  const accent = q.get("c");
  return {
    clipId,
    eventId: "drive-share",
    eventName: names,
    clientNames: names,
    date: "",
    accentColor: accent ? `#${accent.replace("#", "")}` : "#3B82F6",
    logoDataUrl: null,
    frameStyle: frame && isFrameStyleId(frame) ? frame : "gold-oval",
    createdAt: Date.now(),
    durationMs: 10_000,
    source: "demo",
    rampProfile: "time-ramp-v1",
    videoUrl: drivePreviewUrl(driveFileId),
    videoContentType: "video/mp4",
    thumbnailDataUrl: null,
    demoAssetPath: null,
    baked: q.get("b") !== "0",
    destination: "drive",
    driveFileId,
    webViewLink: driveViewUrl(driveFileId),
  };
}

function guestShareLink(
  clipId: string,
  config: ShareConfig | null,
  cloud: CloudShare | null,
  event: { clientNames: string; frameStyle: string; accentColor: string } | undefined,
) {
  const base = clipShareUrl(clipId, config?.origin);
  if (cloud?.destination === "drive" && cloud.driveFileId && !config?.blobConfigured) {
    const q = new URLSearchParams();
    q.set("d", cloud.driveFileId);
    const names = event?.clientNames || cloud.clientNames;
    if (names) q.set("n", names);
    const frame = event?.frameStyle || cloud.frameStyle;
    if (frame) q.set("f", frame);
    const accent = event?.accentColor || cloud.accentColor;
    if (accent) q.set("c", accent.replace("#", ""));
    if (cloud.baked) q.set("b", "1");
    return `${base}?${q.toString()}`;
  }
  return base;
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
