"use client";

import { getBakedBlob, putBakedBlob } from "@/lib/db";
import { DEMO_ASSET_PATH, type Clip } from "@/lib/types";
import { bakeTimeRamp } from "./bake";

const inflight = new Map<string, Promise<Blob>>();

export function bakeSourceForClip(clip: Clip, localBlob?: Blob | null): Blob | string {
  if (localBlob && localBlob.size > 500) return localBlob;
  return clip.demoAssetPath || DEMO_ASSET_PATH;
}

/**
 * Return a cached ramp-baked blob, or encode one and store it next to the original.
 * Concurrent callers for the same clip share a single bake.
 */
export async function ensureBakedClip(options: {
  clip: Clip;
  source?: Blob | string | null;
  onProgress?: (progress: number) => void;
}): Promise<Blob> {
  const { clip, onProgress } = options;

  const running = inflight.get(clip.id);
  if (running) return running;

  const cached = await getBakedBlob(clip.id);
  if (cached && cached.size > 500) return cached;

  const runningAfterLookup = inflight.get(clip.id);
  if (runningAfterLookup) return runningAfterLookup;

  const source = options.source ?? bakeSourceForClip(clip);
  const work = bakeTimeRamp({
    source,
    profile: clip.rampProfile ?? "time-ramp-v1",
    expectedDurationSec: clip.durationMs / 1000,
    onProgress,
  }).then(async (baked) => {
    await putBakedBlob(clip.id, baked);
    return baked;
  });

  inflight.set(clip.id, work);
  try {
    return await work;
  } finally {
    if (inflight.get(clip.id) === work) inflight.delete(clip.id);
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
