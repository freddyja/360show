import { getCache } from "@vercel/functions";
import { REMOTE_SESSION_TTL_MS } from "./types";

const NAMESPACE = "360show-remote";
const READY_TTL_MS = 5 * 60_000;
const SESSION_TTL_SEC = Math.ceil(REMOTE_SESSION_TTL_MS / 1000);

const g = globalThis as unknown as { __360showRemoteCacheReady?: { at: number; ok: boolean } };

function runtimeCache() {
  return getCache({ namespace: NAMESPACE });
}

export function cacheSessionKey(eventId: string) {
  return `session:${eventId}`;
}

export function cacheCommandKey(eventId: string) {
  return `commands:${eventId}`;
}

export function cacheOperatorKey(eventId: string) {
  return `operator:${eventId}`;
}

async function probeRuntimeCache(): Promise<boolean> {
  try {
    const cache = runtimeCache();
    const probeKey = `probe:${process.pid}`;
    const payload = { ok: true, at: Date.now() };
    await cache.set(probeKey, payload, { ttl: 60, name: "360show-remote-probe" });
    const got = (await cache.get(probeKey)) as { ok?: boolean } | null | undefined;
    await cache.delete(probeKey).catch(() => undefined);
    return Boolean(got && got.ok === true);
  } catch {
    return false;
  }
}

/** Shared per-region Runtime Cache. Safe for Hobby JSON sessions; not for song files (2 MB item cap). */
export async function runtimeCacheReady(): Promise<boolean> {
  const cached = g.__360showRemoteCacheReady;
  if (cached && Date.now() - cached.at < READY_TTL_MS) return cached.ok;
  const ok = await probeRuntimeCache();
  g.__360showRemoteCacheReady = { at: Date.now(), ok };
  return ok;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  try {
    const value = await runtimeCache().get(key);
    if (value == null) return null;
    return value as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown) {
  await runtimeCache().set(key, value, {
    ttl: SESSION_TTL_SEC,
    tags: ["360show-remote"],
    name: "360show-remote",
  });
}

export async function cacheDeleteKey(key: string) {
  try {
    await runtimeCache().delete(key);
  } catch {
    try {
      await cacheSetJson(key, { empty: true, clearedAt: Date.now() });
    } catch {
      // Best-effort clear.
    }
  }
}
