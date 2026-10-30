"use client";

/** Build id this bundle was compiled with. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "unknown";

/** Short label for Settings, e.g. "dpl_AbC123" or a 7-char commit. */
export function shortBuildId(id: string | null | undefined) {
  if (!id) return "unknown";
  if (id.startsWith("dpl_")) return id.slice(0, 12);
  if (/^[0-9a-f]{40}$/i.test(id)) return id.slice(0, 7);
  return id;
}

// Anything that must not be interrupted by a reload (countdown, recording,
// processing/bake, Drive or cloud upload) registers a blocker here.
const blockers = new Set<string>();
const listeners = new Set<() => void>();

export function setUpdateBlocker(key: string, active: boolean) {
  const had = blockers.has(key);
  if (active) blockers.add(key);
  else blockers.delete(key);
  if (had !== active) listeners.forEach((l) => l());
}

export function isUpdateBlocked() {
  return blockers.size > 0;
}

export function onBlockersChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function fetchLatestBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/api/version?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { buildId?: string };
    return json.buildId || null;
  } catch {
    return null;
  }
}
