"use client";

import { useEffect, useState } from "react";
import { DEMO_ASSET_PATH } from "@/lib/types";
import { useBooth } from "@/lib/store";

const urlCache = new Map<string, string>();

export function useClipSrc(clipId: string | undefined, fallback?: string | null) {
  const { getBlob } = useBooth();
  const [src, setSrc] = useState<string | null>(fallback ?? null);

  useEffect(() => {
    if (!clipId) {
      setSrc(fallback ?? DEMO_ASSET_PATH);
      return;
    }
    const cached = urlCache.get(clipId);
    if (cached) {
      setSrc(cached);
      return;
    }
    let revoked = false;
    (async () => {
      const blob = await getBlob(clipId);
      if (revoked) return;
      if (blob) {
        const url = URL.createObjectURL(blob);
        urlCache.set(clipId, url);
        setSrc(url);
      } else {
        setSrc(fallback ?? DEMO_ASSET_PATH);
      }
    })();
    return () => {
      revoked = true;
    };
  }, [clipId, fallback, getBlob]);

  return src;
}
