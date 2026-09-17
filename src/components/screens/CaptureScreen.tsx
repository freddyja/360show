"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Eye, Share2 } from "lucide-react";
import { SpinIcon } from "@/components/SpinIcon";
import { StatusBar } from "@/components/StatusBar";
import { FrameOverlay, frameMediaClass } from "@/components/FrameOverlay";
import { RampPlayer } from "@/components/RampPlayer";
import { BootScreen } from "@/components/BootScreen";
import { CrowdOpenControls } from "@/components/CrowdOpenControls";
import { RemoteEnablePanel } from "@/components/RemoteEnablePanel";
import { OperatorShell } from "@/components/OperatorShell";
import { publishCrowd } from "@/lib/crowd/channel";
import { beginLivePreview, recordCapture, thumbnailFromVideo } from "@/lib/capture/record";
import { bakeSourceForClip, ensureBakedClip, needsExportBake } from "@/lib/capture/ensureBaked";
import { hasMusicBed, normalizeMusicBedLabel } from "@/lib/music/beds";
import { usesCustomMusic, musicCaption } from "@/lib/music/custom";
import { formatCustomMusicError, materializeCustomMusicFile } from "@/lib/music/ingest";
import { nudgeBoothMusic, syncBoothMusic, useBoothMusic } from "@/lib/music/player";
import { resolveEventMusic, useEventMusicSrc } from "@/lib/music/resolve";
import { createStubMotor, probeCamera, type CameraStatus } from "@/lib/hardware";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/ids";
import { getFrameStyle, rampProfileForFrame } from "@/lib/frames";
import { operatorSharePath } from "@/lib/shareUrl";
import { useBooth, useEvent } from "@/lib/store";
import { COUNTDOWN_SECONDS, DEMO_ASSET_PATH, captureDurationMs, resolveCaptureDurationSec } from "@/lib/types";
import type { Clip } from "@/lib/types";
import { useClipSrc } from "@/lib/useClipSrc";
import { fetchShareConfig } from "@/lib/share/publish";
import {
  clearStoredPair,
  disableRemote,
  heartbeatRemote,
  pairRemote,
  readStoredPair,
  snapshotFromBooth,
  type RemoteCloudFlags,
  type StoredRemotePair,
} from "@/lib/remote/client";
import {
  REMOTE_POLL_MS,
  boothStatusForPhase,
  isAccentColor,
  isCaptureDurationSec,
  isCloudDestination,
  isMusicBedLabel,
  isVideoQuality,
  type RemoteCommandPayload,
  type RemoteCommandType,
  type RemotePublicView,
} from "@/lib/remote/types";
import { isFrameStyleId } from "@/lib/share/types";

type Phase = "idle" | "countdown" | "recording" | "processing";

type PendingRemoteCommand = {
  id: string;
  type: RemoteCommandType;
  createdAt: number;
  payload?: RemoteCommandPayload;
};

export function CaptureScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { ready, settings, saveClip, patchClip, saveEvent, saveSettings } = useBooth();
  const { event, latestClip } = useEvent(eventId);
  const [camera, setCamera] = useState<CameraStatus>("unavailable");
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [progress, setProgress] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remotePair, setRemotePair] = useState<StoredRemotePair | null>(null);
  const [remoteView, setRemoteView] = useState<RemotePublicView | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const motor = useMemo(() => createStubMotor(), []);
  const lastSrc = useClipSrc(latestClip?.id, latestClip?.demoAssetPath);
  const musicSrc = useEventMusicSrc(event);
  const musicActive = phase !== "idle" || previewOpen;

  const eventRef = useRef(event);
  eventRef.current = event;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const messageRef = useRef(message);
  messageRef.current = message;
  const latestClipRef = useRef(latestClip);
  latestClipRef.current = latestClip;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pendingAcksRef = useRef<{ commandId: string; ok: boolean; message: string }[]>([]);
  const remoteTokenRef = useRef<string | null>(null);
  remoteTokenRef.current = remotePair?.token ?? null;
  const handledCommands = useRef(new Set<string>());
  const runSpinRef = useRef<() => Promise<void>>(async () => undefined);
  const cloudFlagsRef = useRef<RemoteCloudFlags>({
    blobConfigured: false,
    driveConfigured: false,
    driveConnected: false,
  });

  useBoothMusic({
    src: musicSrc,
    active: musicActive && Boolean(musicSrc),
    muted: settings.boothMusicMuted,
  });

  useEffect(() => {
    if (!event) return;
    const crowdPhase =
      phase === "idle" ? (latestClip ? "ready" : "idle") : phase;
    publishCrowd({
      eventId: event.id,
      clipId: latestClip?.id ?? null,
      remoteVideoUrl: latestClip?.remoteVideoUrl ?? null,
      phase: crowdPhase,
      count: phase === "countdown" ? count : undefined,
      updatedAt: Date.now(),
    });
  }, [event, latestClip, phase, count]);

  useEffect(() => {
    let cancelled = false;
    probeCamera().then((status) => {
      if (!cancelled) setCamera(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const stored = readStoredPair(eventId);
    if (stored?.token) {
      setRemotePair(stored);
      setRemoteEnabled(true);
    }
  }, [eventId]);

  const bakeExportInBackground = useCallback(
    async (clip: Clip, blob: Blob | null) => {
      const current = eventRef.current;
      if (!current) return;
      try {
        const music = await resolveEventMusic(current);
        const result = await ensureBakedClip({
          clip,
          source: bakeSourceForClip(clip, blob),
          quality: settingsRef.current.videoQuality,
          musicBedLabel: current.musicBedLabel,
          musicSrc: music.src,
          musicId: music.musicId,
          applyRamp: settingsRef.current.slowMoEnabled !== false,
          frameStyle: current.frameStyle,
          frameNames: current.clientNames,
          frameAccent: current.accentColor,
        });
        await patchClip(clip.id, {
          hasBakedBlob: true,
          bakedAt: Date.now(),
          hasMixedAudio: result.mixedAudio,
        });
      } catch {
        // Download / Share will retry the bake.
      }
    },
    [patchClip],
  );

  const runSpin = useCallback(async () => {
    const current = eventRef.current;
    if (!current || phaseRef.current !== "idle") return;
    const spinMs = captureDurationMs(current.captureDurationSec);
    const resolved = await resolveEventMusic(current);
    const boothSettings = settingsRef.current;
    syncBoothMusic({
      src: resolved.src,
      playing: Boolean(resolved.src),
      muted: boothSettings.boothMusicMuted,
    });
    nudgeBoothMusic();
    setMessage(null);
    setPreviewOpen(false);
    setPhase("countdown");
    setLivePreview(true);

    const live = await beginLivePreview(true, boothSettings.videoQuality);
    if (live.source === "camera") setCamera("ok");
    if (videoRef.current) {
      videoRef.current.srcObject = live.stream;
      void videoRef.current.play().catch(() => undefined);
    }

    for (let i = COUNTDOWN_SECONDS; i >= 1; i -= 1) {
      setCount(i);
      await wait(700);
    }

    setPhase("recording");
    setProgress(0);
    const started = Date.now();
    const tick = window.setInterval(() => {
      setProgress(Math.min(1, (Date.now() - started) / spinMs));
    }, 80);

    void motor.spin(spinMs);
    const recorded = await recordCapture(spinMs, live, boothSettings.videoQuality);
    window.clearInterval(tick);
    setProgress(1);
    live.stop();
    if (videoRef.current) videoRef.current.srcObject = null;
    setLivePreview(false);

    setPhase("processing");
    const blob = recorded.blob;
    const src = blob ? URL.createObjectURL(blob) : DEMO_ASSET_PATH;
    const thumbnail = await thumbnailFromVideo(src);
    if (blob) URL.revokeObjectURL(src);
    const clip: Clip = {
      id: createId("clip"),
      eventId: current.id,
      createdAt: Date.now(),
      durationMs: spinMs,
      source: recorded.source,
      hasBlob: Boolean(blob),
      demoAssetPath: blob ? null : DEMO_ASSET_PATH,
      thumbnailDataUrl: thumbnail,
      rampProfile: rampProfileForFrame(current.frameStyle),
    };
    await saveClip(clip, blob);
    if (needsExportBake(boothSettings.slowMoEnabled !== false, current.musicBedLabel, usesCustomMusic(current), current.frameStyle)) {
      void bakeExportInBackground(clip, blob);
    }
    await wait(600);
    setPhase("idle");
    setMessage(
      recorded.source === "demo"
        ? boothSettings.slowMoEnabled !== false
          ? "Demo spin saved — camera was unavailable. Baking export in the background."
          : hasMusicBed(current.musicBedLabel) || usesCustomMusic(current)
            ? "Demo spin saved — camera was unavailable. Mixing music into the export."
            : "Demo spin saved — camera was unavailable. Slow-mo is off; the look-pack frame still burns on Download / Share."
        : boothSettings.slowMoEnabled !== false
          ? "Spin saved. Baking export in the background."
          : hasMusicBed(current.musicBedLabel) || usesCustomMusic(current)
            ? "Spin saved. Mixing music into the export."
            : "Spin saved at normal speed. Download / Share still burn the look-pack frame.",
    );
  }, [bakeExportInBackground, motor, saveClip]);

  runSpinRef.current = runSpin;

  const boothSnapshot = useCallback(() => {
    const current = eventRef.current;
    if (!current) return null;
    return snapshotFromBooth(current, settingsRef.current, cloudFlagsRef.current);
  }, []);

  const refreshCloudFlags = useCallback(async () => {
    try {
      const config = await fetchShareConfig();
      let driveConnected = Boolean(config.driveConnected);
      try {
        const statusRes = await fetch("/api/drive/status", { cache: "no-store" });
        const status = (await statusRes.json()) as { connected?: boolean };
        driveConnected = Boolean(status.connected);
      } catch {
        // share config is enough
      }
      cloudFlagsRef.current = {
        blobConfigured: Boolean(config.blobConfigured),
        driveConfigured: Boolean(config.driveConfigured),
        driveConnected,
      };
    } catch {
      // snapshot still has settings; cloud flags stay previous
    }
  }, []);

  const applyRemoteCommand = useCallback(
    async (cmd: PendingRemoteCommand) => {
      const ack = (ok: boolean, message: string) => {
        pendingAcksRef.current.push({ commandId: cmd.id, ok, message });
      };
      const current = eventRef.current;
      if (!current) {
        ack(false, "Event not loaded");
        return;
      }
      try {
        if (cmd.type === "startSpin") {
          if (phaseRef.current !== "idle") {
            ack(false, "Booth is busy");
            return;
          }
          await runSpinRef.current();
          ack(true, "Spin captured");
          return;
        }
        if (cmd.type === "setCustomMusic") {
          const token = remoteTokenRef.current;
          const fileName = cmd.payload?.fileName?.trim();
          if (!token || !fileName) {
            ack(false, "Laptop song is missing pair data");
            return;
          }
          setMessage("Loading song from laptop…");
          const ac = new AbortController();
          const timer = window.setTimeout(() => ac.abort(), 45_000);
          try {
            const res = await fetch(
              `/api/remote/music?eventId=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}`,
              { signal: ac.signal, cache: "no-store" },
            );
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as { error?: string };
              const fail = data.error || "Could not download the laptop song";
              setMessage(fail);
              ack(false, fail);
              return;
            }
            const blob = await res.blob();
            const raw = new File([blob], fileName, {
              type: cmd.payload?.contentType || blob.type || "application/octet-stream",
            });
            const file = await materializeCustomMusicFile(raw, { signal: ac.signal });
            window.clearTimeout(timer);
            const next = { ...current, preferBundledBed: false, updatedAt: Date.now() };
            await saveEvent(next, true, { file });
            eventRef.current = {
              ...next,
              preferBundledBed: false,
              customMusicName: file.name,
              customMusicBlobId: current.customMusicBlobId || "pending",
            };
            setMessage(`Laptop song ready: ${file.name}`);
            ack(true, `Playing ${file.name} on the booth`);
          } catch (error) {
            const fail = formatCustomMusicError(
              ac.signal.aborted
                ? Object.assign(new Error("The laptop song took too long to land on this phone."), {
                    name: "TimeoutError",
                  })
                : error,
            );
            setMessage(fail);
            ack(false, fail);
          } finally {
            window.clearTimeout(timer);
          }
          return;
        }
        if (cmd.type === "setSpinLength") {
          const sec = cmd.payload?.captureDurationSec;
          if (!isCaptureDurationSec(sec)) {
            ack(false, "Invalid spin length");
            return;
          }
          const next = { ...current, captureDurationSec: sec, updatedAt: Date.now() };
          await saveEvent(next);
          eventRef.current = next;
          ack(true, `Spin length ${sec}s`);
          return;
        }
        if (cmd.type === "setMusicBed") {
          const label = cmd.payload?.musicBedLabel;
          if (!isMusicBedLabel(label)) {
            ack(false, "Unknown music bed");
            return;
          }
          const next = {
            ...current,
            musicBedLabel: normalizeMusicBedLabel(label),
            preferBundledBed: true,
            updatedAt: Date.now(),
          };
          await saveEvent(next);
          eventRef.current = next;
          ack(true, label === "None" ? "Music cleared for next spin" : `Music bed: ${label}`);
          return;
        }
        if (cmd.type === "setFrameStyle") {
          const id = cmd.payload?.frameStyle;
          if (typeof id !== "string" || !isFrameStyleId(id)) {
            ack(false, "Unknown frame");
            return;
          }
          const style = getFrameStyle(id);
          const next = {
            ...current,
            frameStyle: style.id,
            accentColor: style.defaultAccent || current.accentColor,
            updatedAt: Date.now(),
          };
          await saveEvent(next);
          eventRef.current = next;
          ack(true, `Frame: ${style.name}`);
          return;
        }
        if (cmd.type === "setEventBranding") {
          const next = { ...current, updatedAt: Date.now() };
          const bits: string[] = [];
          if (cmd.payload?.name) {
            next.name = cmd.payload.name;
            bits.push("name");
          }
          if (cmd.payload?.clientNames) {
            next.clientNames = cmd.payload.clientNames;
            bits.push("names");
          }
          if (cmd.payload?.accentColor && isAccentColor(cmd.payload.accentColor)) {
            next.accentColor = cmd.payload.accentColor;
            bits.push("accent");
          }
          await saveEvent(next);
          eventRef.current = next;
          ack(true, bits.length ? `Updated ${bits.join(", ")}` : "Branding unchanged");
          return;
        }
        if (cmd.type === "setSlowMo") {
          if (typeof cmd.payload?.slowMoEnabled !== "boolean") {
            ack(false, "Invalid slow-mo value");
            return;
          }
          const next = { ...settingsRef.current, slowMoEnabled: cmd.payload.slowMoEnabled };
          await saveSettings(next);
          settingsRef.current = next;
          ack(true, cmd.payload.slowMoEnabled ? "Slow-mo on" : "Slow-mo off");
          return;
        }
        if (cmd.type === "setVideoQuality") {
          if (!isVideoQuality(cmd.payload?.videoQuality)) {
            ack(false, "Invalid video quality");
            return;
          }
          const next = { ...settingsRef.current, videoQuality: cmd.payload.videoQuality };
          await saveSettings(next);
          settingsRef.current = next;
          ack(true, cmd.payload.videoQuality === "standard" ? "Quality: Standard 720p" : "Quality: High 1080p");
          return;
        }
        if (cmd.type === "setBoothMusicMuted") {
          if (typeof cmd.payload?.boothMusicMuted !== "boolean") {
            ack(false, "Invalid mute value");
            return;
          }
          const next = { ...settingsRef.current, boothMusicMuted: cmd.payload.boothMusicMuted };
          await saveSettings(next);
          settingsRef.current = next;
          ack(true, cmd.payload.boothMusicMuted ? "Booth music muted" : "Booth music on");
          return;
        }
        if (cmd.type === "setCloudDestination") {
          if (!isCloudDestination(cmd.payload?.cloudDestination)) {
            ack(false, "Invalid cloud destination");
            return;
          }
          const next = {
            ...settingsRef.current,
            cloudDestination: cmd.payload.cloudDestination,
            driveFolderName: cmd.payload.driveFolderName || settingsRef.current.driveFolderName,
          };
          await saveSettings(next);
          settingsRef.current = next;
          await refreshCloudFlags();
          ack(
            true,
            cmd.payload.cloudDestination === "drive"
              ? "Cloud destination: Google Drive (connect on the phone if needed)"
              : "Cloud destination: Vercel Blob",
          );
          return;
        }
        ack(false, "Unknown command");
      } catch (error) {
        ack(false, error instanceof Error ? error.message : "Command failed on booth");
      }
    },
    [eventId, refreshCloudFlags, saveEvent, saveSettings],
  );

  useEffect(() => {
    if (!remoteEnabled) return;
    void refreshCloudFlags();
    const id = window.setInterval(() => void refreshCloudFlags(), 15_000);
    return () => window.clearInterval(id);
  }, [refreshCloudFlags, remoteEnabled]);

  useEffect(() => {
    if (!remoteEnabled || !remotePair?.token || !event) return;
    const token = remotePair.token;
    let cancelled = false;
    let inFlight = false;

    async function tick() {
      if (cancelled || inFlight) return;
      const current = eventRef.current;
      if (!current) return;
      inFlight = true;
      const acks = pendingAcksRef.current.slice();
      try {
        const result = await heartbeatRemote({
          eventId,
          token,
          boothArmed: true,
          boothPhase: phaseRef.current,
          boothStatus: boothStatusForPhase(phaseRef.current, messageRef.current),
          lastClipId: latestClipRef.current?.id ?? null,
          snapshot: boothSnapshot() || snapshotFromBooth(current, settingsRef.current, cloudFlagsRef.current),
          acks,
        });
        if (cancelled) return;
        const remaining = new Set((result.pendingCommands || []).map((item) => item.id));
        if (result.pendingCommand?.id) remaining.add(result.pendingCommand.id);
        pendingAcksRef.current = pendingAcksRef.current.filter((item) => remaining.has(item.commandId));
        setRemoteView(result.view);
        setRemoteError(null);
        const cmds = (result.pendingCommands || (result.pendingCommand ? [result.pendingCommand] : [])) as PendingRemoteCommand[];
        for (const cmd of cmds) {
          if (!cmd?.id || handledCommands.current.has(cmd.id)) continue;
          handledCommands.current.add(cmd.id);
          if (cmd.type === "startSpin") void applyRemoteCommand(cmd);
          else await applyRemoteCommand(cmd);
        }
      } catch (error) {
        if (!cancelled) {
          setRemoteError(error instanceof Error ? error.message : "Remote heartbeat failed");
        }
      } finally {
        inFlight = false;
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), REMOTE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      void heartbeatRemote({
        eventId,
        token,
        boothArmed: false,
        boothPhase: "idle",
        boothStatus: "Capture closed",
        lastClipId: latestClipRef.current?.id ?? null,
        snapshot: boothSnapshot() || snapshotFromBooth(eventRef.current || event, settingsRef.current, cloudFlagsRef.current),
      }).catch(() => undefined);
    };
  }, [applyRemoteCommand, boothSnapshot, event, eventId, remoteEnabled, remotePair]);

  async function onEnableRemote() {
    if (!event) return;
    setRemoteError(null);
    try {
      await refreshCloudFlags();
      const data = await pairRemote(event.id, snapshotFromBooth(event, settings, cloudFlagsRef.current));
      setRemotePair({ token: data.token, pairCode: data.pairCode, remoteUrl: data.remoteUrl });
      setRemoteView(data.view);
      setRemoteEnabled(true);
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : "Could not enable remote");
      setRemoteEnabled(false);
    }
  }

  async function onDisableRemote() {
    const token = remotePair?.token;
    setRemoteEnabled(false);
    setRemoteView(null);
    setRemotePair(null);
    clearStoredPair(eventId);
    if (token) {
      await disableRemote(eventId, token).catch(() => undefined);
    }
  }

  if (!ready) return <BootScreen />;
  if (!event) {
    return (
      <OperatorShell eventId={eventId}>
        <p className="text-slate-300">This event was not found.</p>
      </OperatorShell>
    );
  }

  const offline = settings.forceOffline || (typeof navigator !== "undefined" && !navigator.onLine);
  const busy = phase !== "idle";
  const hasClip = Boolean(latestClip);
  const spinSec = resolveCaptureDurationSec(event.captureDurationSec);
  const customActive = usesCustomMusic(event);

  return (
    <OperatorShell eventId={eventId}>
      <div className="flex min-h-0 flex-1 flex-col">
      <StatusBar camera={camera} settings={settings} offline={offline} />

      <div className="mt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {event.name} — {event.clientNames}
        </h1>
        <div className="mt-1 h-1 w-24 rounded-full" style={{ backgroundColor: event.accentColor }} />
        <CrowdOpenControls eventId={event.id} clipId={latestClip?.id} className="mt-4" />
        <div className="mt-3">
          <RemoteEnablePanel
            enabled={remoteEnabled}
            remoteUrl={remotePair?.remoteUrl ?? null}
            pairCode={remotePair?.pairCode ?? remoteView?.pairCode ?? null}
            view={remoteView}
            error={remoteError}
            busy={busy}
            onEnable={() => void onEnableRemote()}
            onDisable={() => void onDisableRemote()}
          />
        </div>
      </div>

      <div className="relative mt-6 flex min-h-[240px] flex-1 flex-col">
        <video
          ref={videoRef}
          className={cn(
            "absolute inset-0 h-full w-full rounded-[28px] object-cover",
            livePreview ? "opacity-100" : "opacity-0",
          )}
          muted
          playsInline
        />

        <button
          type="button"
          onClick={() => void runSpin()}
          disabled={busy}
          className={cn(
            "group relative flex min-h-[240px] w-full flex-1 items-center justify-center overflow-hidden rounded-[28px] border border-white/10 px-6 text-left disabled:cursor-wait",
            livePreview ? "bg-black/50" : "booth-stage",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_8%_90%,rgba(255,45,149,0.45),transparent_52%),radial-gradient(80%_60%_at_95%_20%,rgba(34,211,238,0.35),transparent_50%)]" />
          <div className="relative flex w-full max-w-3xl items-center gap-6 sm:gap-10">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-cyan-300/60 bg-cyan-400/20 shadow-[0_0_36px_rgba(34,211,238,0.55)] sm:h-24 sm:w-24">
              <SpinIcon
                className={cn("h-10 w-10 text-blue-400 sm:h-12 sm:w-12", busy && "animate-spin")}
              />
            </span>
            <span>
              <span className="block text-4xl font-semibold tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] sm:text-6xl">
                {phase === "countdown" && count}
                {phase === "recording" && "SPINNING"}
                {phase === "processing" && "RAMP"}
                {phase === "idle" && "START SPIN"}
              </span>
              <span className="mt-1 block text-base text-slate-300 sm:text-xl">
                {phase === "countdown" && "Hold still — capture starting"}
                {phase === "recording" && `Recording ${Math.min(spinSec, Math.round(progress * spinSec))}s / ${spinSec}s`}
                {phase === "processing" && "Saving spin"}
                {phase === "idle" && `Launch ${spinSec}s 360° photo booth spin`}
              </span>
            </span>
          </div>
          {phase === "recording" && (
            <span className="absolute bottom-0 left-0 h-1 bg-blue-500" style={{ width: `${progress * 100}%` }} />
          )}
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-slate-400">{message}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ActionCard
          icon={Camera}
          title="Recapture"
          subtitle="Retake this spin"
          onClick={() => void runSpin()}
          disabled={busy}
        />
        <ActionCard
          icon={Eye}
          title="Preview"
          subtitle="Review 360 view"
          onClick={() => {
            if (event) {
              syncBoothMusic({
                src: musicSrc,
                playing: Boolean(musicSrc),
                muted: settings.boothMusicMuted,
              });
              nudgeBoothMusic();
            }
            setPreviewOpen(true);
          }}
          disabled={!hasClip || busy}
        />
        <ActionCard
          icon={Share2}
          title="Share"
          subtitle="Share this spin"
          onClick={() => latestClip && router.push(operatorSharePath(event.id, latestClip.id))}
          disabled={!hasClip || busy}
        />
      </div>

      {previewOpen && latestClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="booth-frame relative w-full max-w-4xl overflow-hidden rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative aspect-video">
              <RampPlayer
                src={lastSrc}
                poster={latestClip.thumbnailDataUrl}
                className={cn("h-full w-full object-cover", frameMediaClass(event.frameStyle))}
                rampProfile={rampProfileForFrame(event.frameStyle)}
                liveRamp={settings.slowMoEnabled !== false}
              />
              <FrameOverlay style={event.frameStyle} names={event.clientNames} accentColor={event.accentColor} />
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-slate-300">
                {settings.slowMoEnabled !== false
                  ? "Live playback ramp · Download / Share bake slow-mo and the look-pack frame"
                  : "Normal speed · Download / Share still burn the frame into the file"}
                {hasMusicBed(event.musicBedLabel) || customActive
                  ? settings.boothMusicMuted
                    ? " · booth music muted"
                    : ` · ${musicCaption(event, normalizeMusicBedLabel(event.musicBedLabel))}`
                  : ""}
              </p>
              <button type="button" className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white" onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </OperatorShell>
  );
}

function ActionCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: typeof Camera;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="booth-card flex min-h-[96px] items-center gap-4 rounded-2xl border px-5 text-left transition hover:border-blue-400/40 disabled:opacity-40"
    >
      <Icon className="h-9 w-9 text-blue-400" strokeWidth={1.7} />
      <span>
        <span className="block text-xl font-medium text-white">{title}</span>
        <span className="block text-[15px] text-slate-400">{subtitle}</span>
      </span>
    </button>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
