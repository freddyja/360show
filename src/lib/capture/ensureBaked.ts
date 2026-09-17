"use client";

import { getBakedBlob, putBakedBlob } from "@/lib/db";
import { DEMO_ASSET_PATH, type Clip, type FrameStyleId } from "@/lib/types";
import { hasMusicBed, musicBedId } from "../music/beds";
import { frameBakeId, isBurnableFrame } from "../frames";
import { bakeTimeRamp, bakedBlobKey, type BakeResult } from "./bake";
import type { VideoQuality } from "./quality";

const inflight = new Map<string, Promise<BakeResult>>();

export function bakeSourceForClip(clip: Clip, localBlob?: Blob | null): Blob | string {
  if (localBlob && localBlob.size > 500) return localBlob;
  return clip.demoAssetPath || DEMO_ASSET_PATH;
}

export function needsExportBake(
  slowMo: boolean,
  musicLabel?: string | null,
  hasCustom = false,
  frameStyle?: FrameStyleId | string | null,
) {
  return Boolean(slowMo) || hasCustom || hasMusicBed(musicLabel) || isBurnableFrame(frameStyle);
}

/**
 * Return a cached ramp-baked (and optionally music-mixed + framed) blob, or
 * encode one and store it next to the original. Concurrent callers for the
 * same clip + bed + ramp + frame share a single bake.
 */
export async function ensureBakedClip(options: {
  clip: Clip;
  source?: Blob | string | null;
  quality?: VideoQuality;
  musicBedLabel?: string | null;
  musicSrc?: string | null;
  musicId?: string | null;
  applyRamp?: boolean;
  frameStyle?: FrameStyleId | string | null;
  frameNames?: string | null;
  frameAccent?: string | null;
  onProgress?: (progress: number) => void;
}): Promise<BakeResult> {
  const { clip, onProgress } = options;
  const applyRamp = options.applyRamp !== false;
  const musicId = options.musicId || musicBedId(options.musicBedLabel);
  const frameId = frameBakeId(options.frameStyle);
  const cacheKey = bakedBlobKey(clip.id, musicId, applyRamp, frameId);
  const workKey = `${clip.id}:${applyRamp ? "sm" : "1x"}:${musicId}:${frameId}`;

  const running = inflight.get(workKey);
  if (running) return running;

  const cached = await getBakedBlob(clip.id, cacheKey);
  if (cached && cached.size > 500) {
    return {
      blob: cached,
      mixedAudio: musicId !== "none" ? clip.hasMixedAudio !== false : false,
    };
  }

  const runningAfterLookup = inflight.get(workKey);
  if (runningAfterLookup) return runningAfterLookup;

  const source = options.source ?? bakeSourceForClip(clip);
  const work = bakeTimeRamp({
    source,
    profile: clip.rampProfile ?? "time-ramp-v1",
    expectedDurationSec: clip.durationMs / 1000,
    quality: options.quality,
    musicBedLabel: options.musicBedLabel,
    musicSrc: options.musicSrc,
    applyRamp,
    frameStyle: options.frameStyle,
    frameNames: options.frameNames,
    frameAccent: options.frameAccent,
    onProgress,
  }).then(async (result) => {
    await putBakedBlob(clip.id, result.blob, cacheKey);
    return result;
  });

  inflight.set(workKey, work);
  try {
    return await work;
  } finally {
    if (inflight.get(workKey) === work) inflight.delete(workKey);
  }
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

export function extensionForBlob(blob: Blob) {
  return blob.type.includes("mp4") ? "mp4" : blob.type.includes("quicktime") ? "mov" : "webm";
}
