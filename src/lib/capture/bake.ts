import type { RampProfileId } from "../types";
import { MUSIC_BED_CATALOG, musicBedSrc } from "../music/beds";
import { mixMusicIntoStream } from "../music/mix";
import { frameBakeId } from "../frames";
import { drawVideoWithFrame, prepareFrameBurn } from "./burnFrame";
import { playbackRateAt, rampKeyframes } from "./ramp";
import { createVideoRecorder, fitWithinQuality, resolveVideoQuality, typedVideoBlob, type VideoQuality } from "./quality";

const FREEZE_HOLD_MS = 1200;
const MAX_BAKE_MS = 120_000;
const MIN_RATE = 0.08;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function bakedBlobKey(
  clipId: string,
  musicId = "none",
  applyRamp = true,
  frameId = "none",
) {
  // `__c3` invalidates mixes that had no burned look-pack frame.
  const frame = frameBakeId(frameId);
  return `${clipId}__baked__${applyRamp ? "sm" : "1x"}__${musicId}__${frame}__c3`;
}

export function bakedBlobKeysForClip(clipId: string) {
  const keys = new Set<string>([bakedBlobKey(clipId)]);
  for (const bed of MUSIC_BED_CATALOG) {
    keys.add(bakedBlobKey(clipId, bed.id, true));
    keys.add(bakedBlobKey(clipId, bed.id, false));
  }
  return [...keys];
}

export interface BakeResult {
  blob: Blob;
  mixedAudio: boolean;
}

/**
 * Re-encode a source clip so the time-ramp, optional music bed, and look-pack
 * frame are in the file. Records a canvas of the video playing at the profile's
 * playbackRate (wall-clock MediaRecorder), then holds a freeze if the profile
 * ends at 0. When a music src is set, Web Audio loops the bed or custom song
 * onto an audio track. If the browser drops that track, the video still bakes
 * and `mixedAudio` is false (live overlay remains the fallback).
 */
export async function bakeTimeRamp(options: {
  source: Blob | string;
  profile: RampProfileId;
  expectedDurationSec?: number;
  quality?: VideoQuality;
  musicBedLabel?: string | null;
  /** Blob URL or bundled path. Wins over musicBedLabel when set. */
  musicSrc?: string | null;
  applyRamp?: boolean;
  frameStyle?: string | null;
  frameNames?: string | null;
  frameAccent?: string | null;
  onProgress?: (progress: number) => void;
}): Promise<BakeResult> {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("Baking slow-mo needs a browser with MediaRecorder");
  }

  const src = typeof options.source === "string" ? options.source : URL.createObjectURL(options.source);
  const revoke = typeof options.source !== "string";
  const applyRamp = options.applyRamp !== false;
  const keyframes = applyRamp ? rampKeyframes(options.profile) : [
    { at: 0, rate: 1 },
    { at: 1, rate: 1 },
  ];

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

  let mixStop: (() => void) | undefined;

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
    const frame = await prepareFrameBurn({
      style: options.frameStyle,
      names: options.frameNames,
      accentColor: options.frameAccent,
    });
    const paint = () => drawVideoWithFrame(ctx, video, frame, canvas.width, canvas.height);

    const canvasStream = canvas.captureStream(fitted.fps);
    const mixSrc = options.musicSrc ?? musicBedSrc(options.musicBedLabel);
    const mix = await mixMusicIntoStream(canvasStream, mixSrc);
    mixStop = mix.stop;

    let recorder: MediaRecorder;
    let mixedAudio = mix.mixedAudio;
    try {
      recorder = createVideoRecorder(mix.stream, fitted.bitrate);
    } catch {
      mix.stop();
      mixStop = undefined;
      mixedAudio = false;
      recorder = createVideoRecorder(canvasStream, fitted.bitrate);
    }

    if (mixedAudio && recorder.stream && recorder.stream.getAudioTracks().length === 0) {
      mixedAudio = false;
    }

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
        void typedVideoBlob(chunks, recorder.mimeType).then(resolve, reject);
      };
    });

    let drawing = true;
    const draw = () => {
      if (!drawing) return;
      paint();
      requestAnimationFrame(draw);
    };
    draw();

    await video.play();
    paint();
    recorder.start(200);
    options.onProgress?.(0);

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

        if (applyRamp && rate <= 0.04) {
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
    paint();
    await wait(250);
    if (recorder.state !== "inactive") recorder.stop();
    mix.stream.getTracks().forEach((track) => track.stop());
    canvasStream.getTracks().forEach((track) => track.stop());
    const blob = await recorded;
    return { blob, mixedAudio };
  } finally {
    mixStop?.();
    video.pause();
    video.removeAttribute("src");
    video.load();
    host.remove();
    if (revoke) URL.revokeObjectURL(src);
  }
}
