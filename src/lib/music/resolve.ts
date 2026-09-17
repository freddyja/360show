"use client";

import { useEffect, useState } from "react";
import { getNamedBlob } from "@/lib/db";
import type { BoothEvent } from "@/lib/types";
import { musicBedId, musicBedSrc } from "./beds";
import { exportMusicId, usesCustomMusic } from "./custom";

const objectUrls = new Map<string, string>();

export async function srcForCustomMusic(blobId: string): Promise<string | null> {
  const cached = objectUrls.get(blobId);
  if (cached) return cached;
  const blob = await getNamedBlob(blobId);
  if (!blob || blob.size < 64) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(blobId, url);
  return url;
}

export function forgetCustomMusicSrc(blobId: string | null | undefined) {
  if (!blobId) return;
  const url = objectUrls.get(blobId);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(blobId);
  }
}

export async function resolveEventMusic(event: BoothEvent | null | undefined): Promise<{
  src: string | null;
  musicId: string;
}> {
  if (!event) return { src: null, musicId: "none" };
  if (event.customMusicBlobId && !event.preferBundledBed) {
    const src = await srcForCustomMusic(event.customMusicBlobId);
    if (src) return { src, musicId: exportMusicId(event) || "custom" };
  }
  return {
    src: musicBedSrc(event.musicBedLabel),
    musicId: musicBedId(event.musicBedLabel),
  };
}

/** Object URL for a custom song, or bundled bed path. */
export function useEventMusicSrc(event: BoothEvent | null | undefined) {
  const [src, setSrc] = useState<string | null>(() =>
    event && !usesCustomMusic(event) ? musicBedSrc(event.musicBedLabel) : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!event) {
      setSrc(null);
      return;
    }
    if (!usesCustomMusic(event)) {
      setSrc(musicBedSrc(event.musicBedLabel));
      return;
    }
    void srcForCustomMusic(event.customMusicBlobId as string).then((next) => {
      if (cancelled) return;
      setSrc(next ?? musicBedSrc(event.musicBedLabel));
    });
    return () => {
      cancelled = true;
    };
  }, [event, event?.id, event?.customMusicBlobId, event?.musicBedLabel, event?.preferBundledBed]);

  return src;
}
