"use client";

import { useEffect, useState } from "react";
import { DEMO_ASSET_PATH } from "@/lib/types";
import { useBooth } from "@/lib/store";

const urlCache = new Map<string, string>();

export function useClipSrc(
  clipId: string | undefined,
  fallback?: string | null,
  remoteUrl?: string | null,
) {
  const { getBlob } = useBooth();
  const [src, setSrc] = useState<string | null>(remoteUrl || fallback || null);

  useEffect(() => {
    if (!clipId) {
      setSrc(remoteUrl || fallback || DEMO_ASSET_PATH);
      return;
    }
    const cached = urlCache.get(clipId);
    if (cached) {
      setSrc(cached);
      return;
    }
    let revoked = false;
    (async () => {
      try {
        const blob = await getBlob(clipId);
        if (revoked) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          urlCache.set(clipId, url);
          setSrc(url);
          return;
        }
      } catch {
        // Guest phones have no local clip store.
      }
      if (revoked) return;
      setSrc(remoteUrl || fallback || DEMO_ASSET_PATH);
    })();
    return () => {
      revoked = true;
    };
  }, [clipId, fallback, remoteUrl, getBlob]);

  return src;
}
