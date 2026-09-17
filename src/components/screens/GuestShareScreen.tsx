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
import { frameHudTop, rampProfileForFrame } from "@/lib/frames";
import { useClipSrc } from "@/lib/useClipSrc";
import { cn } from "@/lib/cn";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchCloudShare, fetchShareConfig, publishClipToCloud, publishClipToDrive } from "@/lib/share/publish";
import { BLOB_CLOUD_UNAVAILABLE_MESSAGE, isBlobUnusableError } from "@/lib/share/access";
import { bakeSourceForClip, ensureBakedClip, needsExportBake, extensionForBlob, triggerBlobDownload } from "@/lib/capture/ensureBaked";
import { isWebmContainer } from "@/lib/capture/quality";
import { publishCrowd } from "@/lib/crowd/channel";
import { hasMusicBed, musicBedById, musicBedId, musicBedSrc, normalizeMusicBedLabel } from "@/lib/music/beds";
import { usesCustomMusic } from "@/lib/music/custom";
import { nudgeBoothMusic, syncBoothMusic, useBoothMusic } from "@/lib/music/player";
import { resolveEventMusic, useEventMusicSrc } from "@/lib/music/resolve";
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
  const operatorSlowMo = settings.slowMoEnabled !== false;
  const musicLabel = normalizeMusicBedLabel(event?.musicBedLabel || resolvedCloud?.musicBedLabel);
  const operatorMusicSrc = useEventMusicSrc(publicMode ? undefined : localEvent);
  const skipOverlay = Boolean(resolvedCloud?.hasAudio && isDrivePlaybackUrl(src));
  const overlaySrc = skipOverlay
    ? null
    : publicMode
      ? musicBedSrc(musicLabel)
      : operatorMusicSrc;
  useBoothMusic({
    src: overlaySrc,
    active: Boolean(clip && event && overlaySrc),
    muted: publicMode ? false : settings.boothMusicMuted,
  });
  const fileHasAudio = Boolean(publicMode && resolvedCloud?.hasAudio && !isDrivePlaybackUrl(src));
  const shareUrl = useMemo(
    () => guestShareLink(clipId, config, resolvedCloud, event),
    [clipId, config, resolvedCloud, event],
  );
  const year = event?.date?.slice(0, 4) ?? "2026";
  const hudTop = frameHudTop(event?.frameStyle);
  const rampProfile = event ? rampProfileForFrame(event.frameStyle) : "time-ramp-v1";
  const liveRamp = isDrivePlaybackUrl(src)
    ? false
    : localClip && !publicMode
      ? operatorSlowMo
      : Boolean(resolvedCloud && resolvedCloud.slowMoEnabled !== false && !resolvedCloud.baked);
  const hasLocalOriginal = Boolean(localClip && (localClip.hasBlob || localClip.demoAssetPath));
  const showWebFrame = hasLocalOriginal || liveRamp || !resolvedCloud?.baked;
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
    const publishKey = `${clipId}:${destination}:${operatorSlowMo ? "slowmo" : "1x"}:${musicBedId(localEvent.musicBedLabel)}:${localEvent.customMusicBlobId || "bed"}:${localEvent.frameStyle}`;
    if (publishOnce.current === publishKey) return;
    publishOnce.current = publishKey;
    let cancelled = false;
    const clipToPublish = localClip;
    const eventToPublish = localEvent;
    (async () => {
      try {
        const sourceBlob = await getBlob(clipToPublish.id);
        let exportBlob = sourceBlob;
        let mixedAudio = false;
        const music = await resolveEventMusic(eventToPublish);
        const musicBedLabel = usesCustomMusic(eventToPublish) ? "None" : eventToPublish.musicBedLabel;
        const shouldBake = needsExportBake(
          operatorSlowMo,
          eventToPublish.musicBedLabel,
          usesCustomMusic(eventToPublish),
          eventToPublish.frameStyle,
        );
        if (shouldBake) {
          setPublishState(
            operatorSlowMo
              ? "Baking export…"
              : usesCustomMusic(eventToPublish) || hasMusicBed(eventToPublish.musicBedLabel)
                ? "Mixing music…"
                : "Burning frame…",
          );
          const baked = await ensureBakedClip({
            clip: clipToPublish,
            source: bakeSourceForClip(clipToPublish, sourceBlob),
            quality: settings.videoQuality,
            musicBedLabel: eventToPublish.musicBedLabel,
            musicSrc: music.src,
            musicId: music.musicId,
            applyRamp: operatorSlowMo,
            frameStyle: eventToPublish.frameStyle,
            frameNames: eventToPublish.clientNames,
            frameAccent: eventToPublish.accentColor,
            onProgress: (progress) => {
              if (!cancelled) {
                setPublishState(
                  operatorSlowMo
                    ? `Baking export… ${Math.round(progress * 100)}%`
                    : usesCustomMusic(eventToPublish) || hasMusicBed(eventToPublish.musicBedLabel)
                      ? `Mixing music… ${Math.round(progress * 100)}%`
                      : `Burning frame… ${Math.round(progress * 100)}%`,
                );
              }
            },
          });
          exportBlob = baked.blob;
          mixedAudio = baked.mixedAudio;
        }
        if (cancelled) return;
        if (shouldBake) {
          await patchClip(clipToPublish.id, {
            hasBakedBlob: true,
            bakedAt: Date.now(),
            hasMixedAudio: mixedAudio,
          });
        }

        if (settings.forceOffline) {
          setPublishState("Offline — clip stays on this tablet");
          return;
        }
        if (destination === "blob" && !config.blobConfigured) {
          setPublishState(
            config.blobTokenPresent || config.blobUnavailableReason
              ? BLOB_CLOUD_UNAVAILABLE_MESSAGE
              : "Local-only share — add BLOB_READ_WRITE_TOKEN to upload for guest phones",
          );
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

        setPublishState(destination === "drive" ? "Uploading to Google Drive…" : "Uploading to guest cloud…");
        const existing = await fetchCloudShare(clipToPublish.id);
        const published =
          destination === "drive"
            ? await publishClipToDrive({
                event: eventToPublish,
                clip: clipToPublish,
                localBlob: exportBlob,
                folderName: settings.driveFolderName || "360show",
                baked: operatorSlowMo,
                slowMoEnabled: operatorSlowMo,
                musicBedLabel,
                hasAudio: mixedAudio,
                existing,
              })
            : await publishClipToCloud({
                event: eventToPublish,
                clip: clipToPublish,
                localBlob: exportBlob,
                baked: operatorSlowMo,
                slowMoEnabled: operatorSlowMo,
                musicBedLabel,
                hasAudio: mixedAudio,
                blobAccess: config.blobAccess,
                existing,
              });
        if (cancelled) return;
        setCloud(published);
        await patchClip(clipToPublish.id, {
          hasBakedBlob: needsExportBake(operatorSlowMo, eventToPublish.musicBedLabel, usesCustomMusic(eventToPublish), eventToPublish.frameStyle),
          bakedAt: needsExportBake(operatorSlowMo, eventToPublish.musicBedLabel, usesCustomMusic(eventToPublish), eventToPublish.frameStyle)
            ? Date.now()
            : null,
          hasMixedAudio: mixedAudio,
          remoteVideoUrl: published.videoUrl,
          cloudShareAt: Date.now(),
        });
        publishCrowd({
          eventId: eventToPublish.id,
          clipId: clipToPublish.id,
          remoteVideoUrl: published.videoUrl,
          phase: "ready",
          updatedAt: Date.now(),
        });
        if (destination === "drive") {
          const webm = isWebmContainer(exportBlob?.type) || isWebmContainer(published.videoContentType);
          if (published.warning) {
            setPublishState(
              webm
                ? "Live on Google Drive · guest link uses Drive (cloud metadata not saved). WebM may not preview in Drive — download or use Blob for the guest QR."
                : "Live on Google Drive · guest link uses Drive (cloud metadata not saved)",
            );
          } else if (webm) {
            setPublishState(
              "Live on Google Drive · WebM may not preview in Drive — download or use Blob for the guest QR",
            );
          } else {
            setPublishState("Live on Google Drive");
          }
        } else {
          setPublishState("Live for guest phones");
        }
      } catch (error) {
        const fatal = isBlobUnusableError(error);
        if (!fatal) publishOnce.current = null;
        if (!cancelled) {
          setPublishState(
            fatal
              ? BLOB_CLOUD_UNAVAILABLE_MESSAGE
              : error instanceof Error
                ? error.message
                : "Cloud upload failed",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      if (publishOnce.current === publishKey) publishOnce.current = null;
    };
    // localClip / localEvent objects are read once per clip id so a bake metadata
    // saveClip does not cancel an in-flight upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicMode,
    ready,
    localClip?.id,
    localEvent?.id,
    localEvent?.musicBedLabel,
    localEvent?.customMusicBlobId,
    localEvent?.frameStyle,
    config,
    settings.forceOffline,
    settings.driveFolderName,
    destination,
    operatorSlowMo,
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
                ? config.blobTokenPresent || config.blobUnavailableReason
                  ? "Vercel Blob is temporarily unavailable, so this guest link has no cloud clip yet. Download still works on the booth tablet."
                  : "This clip lives on the booth tablet. Deploy with Vercel Blob (BLOB_READ_WRITE_TOKEN) or connect Google Drive in Settings so guest phones can load it."
                : "This share link has no cloud clip yet. Open Share on the booth after connecting storage, or scan again after upload."}
          </p>
        </div>
      </Shell>
    );
  }

  async function download() {
    if (downloading.current) return;
    downloading.current = true;
    setStatus(operatorSlowMo || publicMode ? "Preparing slow-mo file…" : "Preparing file…");
    try {
      const clipRecord = clip;
      const eventRecord = event;
      if (!clipRecord || !eventRecord) {
        setStatus("Nothing to download");
        return;
      }

      const shouldBakeNow = publicMode
        ? Boolean(
            resolvedCloud &&
              ((resolvedCloud.slowMoEnabled !== false && !resolvedCloud.baked) ||
                (hasMusicBed(musicLabel) && !resolvedCloud.hasAudio)),
          )
        : needsExportBake(operatorSlowMo, musicLabel, usesCustomMusic(eventRecord), eventRecord.frameStyle);
      const savedAsSlowMo = publicMode
        ? Boolean(resolvedCloud?.baked) || Boolean(resolvedCloud && resolvedCloud.slowMoEnabled !== false && shouldBakeNow)
        : operatorSlowMo;

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
        if (shouldBakeNow) {
          const music = publicMode ? { src: musicBedSrc(musicLabel), musicId: musicBedId(musicLabel) } : await resolveEventMusic(eventRecord);
          const baked = await ensureBakedClip({
            clip: clipRecord,
            source,
            quality: settings.videoQuality,
            musicBedLabel: musicLabel,
            musicSrc: music.src,
            musicId: music.musicId,
            applyRamp: publicMode
              ? Boolean(resolvedCloud && resolvedCloud.slowMoEnabled !== false)
              : operatorSlowMo,
            frameStyle: eventRecord.frameStyle,
            frameNames: eventRecord.clientNames,
            frameAccent: eventRecord.accentColor,
            onProgress: (progress) =>
              setStatus(
                operatorSlowMo || (publicMode && resolvedCloud?.slowMoEnabled !== false)
                  ? `Baking export… ${Math.round(progress * 100)}%`
                  : hasMusicBed(musicLabel) || usesCustomMusic(eventRecord)
                    ? `Mixing music… ${Math.round(progress * 100)}%`
                    : `Burning frame… ${Math.round(progress * 100)}%`,
              ),
          });
          file = baked.blob;
          if (localClip) {
            await patchClip(localClip.id, {
              hasBakedBlob: true,
              bakedAt: Date.now(),
              hasMixedAudio: baked.mixedAudio,
            });
          }
        } else if (typeof source !== "string") {
          file = source;
        } else {
          file = await fetch(source).then((res) => res.blob());
        }
      }

      if (!file || file.size < 100) {
        setStatus("Nothing to download");
        return;
      }
      const ext = extensionForBlob(file);
      const base = eventRecord.clientNames.replace(/\s+/g, "-") || "360-spin";
      const suffix = savedAsSlowMo ? "-360-spin-slowmo" : "-360-spin";
      triggerBlobDownload(file, `${base}${suffix}.${ext}`);
      const hasMixableMusic = hasMusicBed(musicLabel) || (!publicMode && usesCustomMusic(eventRecord));
      setStatus(
        savedAsSlowMo
          ? hasMixableMusic
            ? "Saved baked export (music mixed when this browser allowed it)"
            : "Saved baked slow-mo"
          : hasMixableMusic
            ? "Saved clip with music (mixed when this browser allowed it)"
            : "Saved original-speed clip",
      );
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
        <div className="booth-card relative overflow-hidden rounded-[24px] border">
          <div
            className="relative aspect-video"
            onPointerDown={() => {
              syncBoothMusic({
                src: overlaySrc,
                playing: Boolean(overlaySrc),
                muted: publicMode ? false : settings.boothMusicMuted,
              });
              nudgeBoothMusic();
            }}
          >
            <RampPlayer
              src={src}
              poster={clip.thumbnailDataUrl}
              className={cn("h-full w-full object-cover", showWebFrame ? frameMediaClass(event.frameStyle) : "")}
              rampProfile={rampProfile}
              liveRamp={liveRamp}
              allowSound={fileHasAudio}
              onPlayingChange={setPlaying}
            />
            {showWebFrame && (
              <FrameOverlay style={event.frameStyle} names={event.clientNames} accentColor={event.accentColor} />
            )}
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
                      : resolvedCloud?.baked || (operatorSlowMo && !publicMode)
                        ? "Baked slow-mo"
                        : "Normal speed"
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
          {!publicMode &&
            destination === "drive" &&
            isWebmContainer(resolvedCloud?.videoContentType) && (
              <p className="px-4 pb-3 text-center text-xs text-amber-200/90">
                Drive often cannot preview WebM (“still being processed”). Download the file, or use
                Vercel Blob for the guest QR. New bakes prefer MP4 when this browser supports it.
              </p>
            )}
        </div>
        <QRCard url={shareUrl} accentColor={event.accentColor} />
      </div>

      <div className="mt-4">
        <ShareActions
          url={shareUrl}
          onDownload={() => void download()}
          canDownload={Boolean(clip.hasBlob || clip.demoAssetPath || remoteUrl || resolvedCloud?.driveFileId)}
          downloadSubtitle={
            publicMode
              ? resolvedCloud?.baked
                ? resolvedCloud.hasAudio
                  ? "Baked file with music"
                  : "Baked slow-mo for this device"
                : "Download to this device"
              : operatorSlowMo
                ? hasMusicBed(musicLabel) || usesCustomMusic(event)
                  ? "Baked slow-mo · music mixed when possible"
                  : "Baked slow-mo for this device"
                : hasMusicBed(musicLabel) || usesCustomMusic(event)
                  ? "File with music (mixed when possible)"
                  : "Normal-speed file for this device"
          }
        />
      </div>

      <footer className="booth-card mt-5 flex items-center justify-center gap-3 rounded-2xl border py-4 text-xl font-medium text-blue-300">
        <Heart className="h-5 w-5 fill-blue-400 text-blue-400" />
        {event.clientNames} · {year}
        <Heart className="h-5 w-5 fill-blue-400 text-blue-400" />
      </footer>
      {publicMode && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Guest phones load this clip from Vercel Blob or Google Drive when the booth has uploaded
          it. Use the deployed HTTPS URL in the QR, not a LAN IP. Downloads are ramp-baked when
          slow-mo is on; a music bed or a song from the booth tablet is mixed in when this browser
          can record audio. Custom songs stay on the booth except inside that mixed file. Look-pack
          frames are burned into the downloaded / uploaded file.
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
    durationMs: (() => {
      const t = Number(q.get("t"));
      return t === 15 || t === 20 ? t * 1000 : 10_000;
    })(),
    source: "demo",
    rampProfile: "time-ramp-v1",
    videoUrl: drivePreviewUrl(driveFileId),
    videoContentType: "video/mp4",
    thumbnailDataUrl: null,
    demoAssetPath: null,
    baked: q.get("b") !== "0" && q.get("sm") !== "0",
    slowMoEnabled: q.get("sm") !== "0",
    musicBedLabel: musicBedById(q.get("m") || "none").label,
    hasAudio: q.get("a") === "1",
    destination: "drive",
    driveFileId,
    webViewLink: driveViewUrl(driveFileId),
  };
}

function guestShareLink(
  clipId: string,
  config: ShareConfig | null,
  cloud: CloudShare | null,
  event: { clientNames: string; frameStyle: string; accentColor: string; musicBedLabel?: string } | undefined,
) {
  const base = clipShareUrl(clipId, config?.origin);
  // Drive guest links always carry ?d= so phones work even if Blob meta.json was not written.
  if (cloud?.destination === "drive" && cloud.driveFileId) {
    const q = new URLSearchParams();
    q.set("d", cloud.driveFileId);
    const names = event?.clientNames || cloud.clientNames;
    if (names) q.set("n", names);
    const frame = event?.frameStyle || cloud.frameStyle;
    if (frame) q.set("f", frame);
    const accent = event?.accentColor || cloud.accentColor;
    if (accent) q.set("c", accent.replace("#", ""));
    if (cloud.baked) q.set("b", "1");
    if (cloud.slowMoEnabled === false) q.set("sm", "0");
    const music = musicBedId(event?.musicBedLabel || cloud.musicBedLabel);
    if (music && music !== "none") q.set("m", music);
    if (cloud.hasAudio) q.set("a", "1");
    const dur = Math.round((cloud.durationMs || 10_000) / 1000);
    if (dur === 15 || dur === 20) q.set("t", String(dur));
    return `${base}?${q.toString()}`;
  }
  return base;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="booth-page p-3 sm:p-4 md:p-5">
      <div className="booth-frame mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-[1400px] flex-col p-4 sm:p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}
