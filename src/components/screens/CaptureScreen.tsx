"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Eye, Share2 } from "lucide-react";
import { SpinIcon } from "@/components/SpinIcon";
import { StatusBar } from "@/components/StatusBar";
import { FrameOverlay, frameMediaClass } from "@/components/FrameOverlay";
import { RampPlayer } from "@/components/RampPlayer";
import { BootScreen } from "@/components/BootScreen";
import { OperatorShell } from "@/components/OperatorShell";
import { beginLivePreview, recordCapture, thumbnailFromVideo } from "@/lib/capture/record";
import { bakeSourceForClip, ensureBakedClip } from "@/lib/capture/ensureBaked";
import { createStubMotor, probeCamera, type CameraStatus } from "@/lib/hardware";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/ids";
import { rampProfileForFrame } from "@/lib/frames";
import { operatorSharePath } from "@/lib/shareUrl";
import { useBooth, useEvent } from "@/lib/store";
import { CAPTURE_DURATION_MS, COUNTDOWN_SECONDS, DEMO_ASSET_PATH } from "@/lib/types";
import type { Clip } from "@/lib/types";
import { useClipSrc } from "@/lib/useClipSrc";

type Phase = "idle" | "countdown" | "recording" | "processing";

export function CaptureScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { ready, settings, saveClip, patchClip } = useBooth();
  const { event, latestClip } = useEvent(eventId);
  const [camera, setCamera] = useState<CameraStatus>("unavailable");
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [progress, setProgress] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const motor = useMemo(() => createStubMotor(), []);
  const lastSrc = useClipSrc(latestClip?.id, latestClip?.demoAssetPath);

  useEffect(() => {
    let cancelled = false;
    probeCamera().then((status) => {
      if (!cancelled) setCamera(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function runSpin() {
    if (busy || !event) return;
    setMessage(null);
    setPreviewOpen(false);
    setPhase("countdown");
    setLivePreview(true);

    const live = await beginLivePreview(true);
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
      setProgress(Math.min(1, (Date.now() - started) / CAPTURE_DURATION_MS));
    }, 80);

    void motor.spin(CAPTURE_DURATION_MS);
    const recorded = await recordCapture(CAPTURE_DURATION_MS, live);
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
      eventId: event.id,
      createdAt: Date.now(),
      durationMs: CAPTURE_DURATION_MS,
      source: recorded.source,
      hasBlob: Boolean(blob),
      demoAssetPath: blob ? null : DEMO_ASSET_PATH,
      thumbnailDataUrl: thumbnail,
      rampProfile: rampProfileForFrame(event.frameStyle),
    };
    await saveClip(clip, blob);
    if (settings.slowMoEnabled !== false) {
      void bakeExportInBackground(clip, blob);
    }
    await wait(600);
    setPhase("idle");
    setMessage(
      recorded.source === "demo"
        ? settings.slowMoEnabled !== false
          ? "Demo spin saved — camera was unavailable. Baking slow-mo export in the background."
          : "Demo spin saved — camera was unavailable. Slow-mo is off, so the file stays normal speed."
        : settings.slowMoEnabled !== false
          ? "Spin saved. Baking slow-mo export in the background."
          : "Spin saved at normal speed.",
    );
  }

  async function bakeExportInBackground(clip: Clip, blob: Blob | null) {
    try {
      await ensureBakedClip({
        clip,
        source: bakeSourceForClip(clip, blob),
      });
      await patchClip(clip.id, { hasBakedBlob: true, bakedAt: Date.now() });
    } catch {
      // Download / Share will retry the bake.
    }
  }

  return (
    <OperatorShell eventId={eventId}>
      <div className="flex min-h-0 flex-1 flex-col">
      <StatusBar camera={camera} settings={settings} offline={offline} />

      <div className="mt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {event.name} — {event.clientNames}
        </h1>
        <div className="mt-3 h-1 w-24 rounded-full" style={{ backgroundColor: event.accentColor }} />
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
            livePreview ? "bg-black/45" : "bg-[#0c1528]",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_90%_50%,rgba(59,130,246,0.35),transparent_55%)]" />
          <div className="relative flex w-full max-w-3xl items-center gap-6 sm:gap-10">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10 sm:h-24 sm:w-24">
              <SpinIcon
                className={cn("h-10 w-10 text-blue-400 sm:h-12 sm:w-12", busy && "animate-spin")}
              />
            </span>
            <span>
              <span className="block text-4xl font-semibold tracking-wide text-white sm:text-6xl">
                {phase === "countdown" && count}
                {phase === "recording" && "SPINNING"}
                {phase === "processing" && "RAMP"}
                {phase === "idle" && "START SPIN"}
              </span>
              <span className="mt-1 block text-base text-slate-300 sm:text-xl">
                {phase === "countdown" && "Hold still — capture starting"}
                {phase === "recording" && `Recording ${Math.round(progress * 10)}s / 10s`}
                {phase === "processing" && "Saving spin"}
                {phase === "idle" && "Launch 360° photo booth spin"}
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
          onClick={() => setPreviewOpen(true)}
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
          <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-[#0a101c]" onClick={(e) => e.stopPropagation()}>
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
                  ? "Live playback ramp · Download / Share save a baked slow-mo file"
                  : "Normal speed · Download / Share save the original file (slow-mo is off)"}
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
      className="flex min-h-[96px] items-center gap-4 rounded-2xl border border-white/10 bg-[#0c1424] px-5 text-left transition hover:border-blue-400/30 disabled:opacity-40"
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
