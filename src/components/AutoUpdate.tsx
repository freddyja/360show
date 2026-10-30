"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  BUILD_ID,
  fetchLatestBuildId,
  isUpdateBlocked,
  onBlockersChange,
} from "@/lib/version";

export const VERSION_POLL_MS = 60_000;

/**
 * Polls /api/version (every 60s, on focus and when the page becomes visible).
 * When a newer deployment is live, reloads — but only while nothing registered
 * a blocker (countdown, recording, processing/bake, upload). If blocked, the
 * reload waits until the last blocker clears. Guest pages (/s/…) are skipped.
 */
export function AutoUpdate() {
  const pathname = usePathname() || "";
  const skip = pathname.startsWith("/s/") || BUILD_ID === "unknown";

  useEffect(() => {
    if (skip) return;
    let pending: string | null = null;
    let reloading = false;
    let checking = false;

    const tryReload = () => {
      if (!pending || reloading || isUpdateBlocked()) return;
      // Loop guard: if we already reloaded for this build and still run the old
      // bundle (stale cache / CDN skew), wait 10 min before trying again.
      try {
        const key = "360show:autoUpdate";
        const prev = JSON.parse(sessionStorage.getItem(key) || "null") as { to: string; at: number } | null;
        if (prev && prev.to === pending && Date.now() - prev.at < 10 * 60_000) return;
        sessionStorage.setItem(key, JSON.stringify({ to: pending, at: Date.now() }));
      } catch {}
      reloading = true;
      window.location.reload();
    };
    const check = async () => {
      if (checking || reloading) return;
      checking = true;
      const latest = await fetchLatestBuildId();
      checking = false;
      if (latest && latest !== "unknown" && latest !== BUILD_ID) {
        pending = latest;
        tryReload();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    const timer = window.setInterval(() => void check(), VERSION_POLL_MS);
    const offBlockers = onBlockersChange(tryReload);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void check();
    return () => {
      window.clearInterval(timer);
      offBlockers();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [skip]);

  return null;
}
