import type { RampProfileId } from "../types";
import { playbackRateAt, rampKeyframes } from "./ramp";
import { createVideoRecorder, fitWithinQuality, resolveVideoQuality, type VideoQuality } from "./quality";

const FREEZE_HOLD_MS = 1200;
const MAX_BAKE_MS = 120_000;
const MIN_RATE = 0.08;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function bakedBlobKey(clipId: string) {
  return `${clipId}__baked`;
}

/**
 * Re-encode a source clip so the time-ramp is in the file itself.
 * Records a canvas of the video playing at the profile's playbackRate
 * (wall-clock MediaRecorder), then holds a freeze if the profile ends at 0.
 */
export async function bakeTimeRamp(options: {
  source: Blob | string;
  profile: RampProfileId;
  expectedDurationSec?: number;
  quality?: VideoQuality;
  onProgress?: (progress: number) => void;
}): Promise<Blob> {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("Baking slow-mo needs a browser with MediaRecorder");
  }

  const src = typeof options.source === "string" ? options.source : URL.createObjectURL(options.source);
  const revoke = typeof options.source !== "string";
  const keyframes = rampKeyframes(options.profile);

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = src;

  const canvas = document.createElement("canvas");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;";
  host.append(video, canvas);
  document.body.appendChild(host);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Timed out loading clip")), 20_000);
      video.onloadeddata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Could not load clip for bake"));
      };
    });

    const duration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : options.expectedDurationSec && options.expectedDurationSec > 0
          ? options.expectedDurationSec
          : 0;
    if (!duration) {
      throw new Error("Clip has no duration to bake");
    }

    const quality = resolveVideoQuality(options.quality);
    const fitted = fitWithinQuality(video.videoWidth, video.videoHeight, quality);
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D unavailable");

    const stream = canvas.captureStream(fitted.fps);
    const recorder = createVideoRecorder(stream, fitted.bitrate);
    const chunks: BlobPart[] = [];
    const recorded = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("Bake recorder failed"));
      recorder.onstop = () => {
        if (!chunks.length) {
          reject(new Error("Bake produced an empty file"));
          return;
        }
        resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
      };
    });

    let drawing = true;
    const draw = () => {
      if (!drawing) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(draw);
    };
    draw();

    await video.play();
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    recorder.start(200);

    const started = performance.now();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (performance.now() - started > MAX_BAKE_MS) {
          reject(new Error("Bake took too long"));
          return;
        }
        const progress = Math.min(1, video.currentTime / duration);
        options.onProgress?.(progress);
        const rate = playbackRateAt(progress, keyframes);

        if (rate <= 0.04) {
          video.pause();
          options.onProgress?.(1);
          window.setTimeout(resolve, FREEZE_HOLD_MS);
          return;
        }

        video.playbackRate = Math.max(rate, MIN_RATE);

        if (video.ended || progress >= 0.999) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      video.onended = () => resolve();
      requestAnimationFrame(tick);
    });

    drawing = false;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    await wait(250);
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    return await recorded;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    host.remove();
    if (revoke) URL.revokeObjectURL(src);
  }
}
