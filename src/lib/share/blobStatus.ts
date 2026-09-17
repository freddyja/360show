import { BlobNotFoundError, head } from "@vercel/blob";
import {
  BLOB_STORE_UNAVAILABLE_MESSAGE,
  formatBlobWriteError,
  isBlobUnusableError,
} from "@/lib/share/access";

const HEALTHY_TTL_MS = 15 * 60_000;
const UNUSABLE_TTL_MS = 15 * 60_000;
const UNREACHABLE_TTL_MS = 60_000;
const PROBE_MS = 4_000;
const HEALTH_PATH = "shares/_360show-health";

export type BlobUnavailableReason = "no-token" | "suspended" | "unreachable" | "error";

export type BlobAvailability = {
  tokenPresent: boolean;
  usable: boolean;
  reason: "ok" | BlobUnavailableReason;
  message: string | null;
};

type CacheEntry = { at: number; ttl: number; value: BlobAvailability };

const g = globalThis as unknown as { __360showBlobStatus?: CacheEntry };
let inflight: Promise<BlobAvailability> | null = null;

export function blobTokenPresent() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function readCache() {
  return g.__360showBlobStatus ?? null;
}

function writeCache(entry: CacheEntry) {
  g.__360showBlobStatus = entry;
}

function cacheFresh(entry: CacheEntry | null) {
  return Boolean(entry && Date.now() - entry.at < entry.ttl);
}

/** True when a recent probe/error already proved the store is unusable. */
export function blobCircuitOpen() {
  const entry = readCache();
  return Boolean(entry && !entry.value.usable && cacheFresh(entry));
}

/**
 * Sync snapshot used by existing call sites.
 * Token presence is not enough: a live circuit-open (suspended store) counts as not configured.
 */
export function blobConfigured() {
  return blobTokenPresent() && !blobCircuitOpen();
}

function availabilityFromError(error: unknown): BlobAvailability {
  const unusable = isBlobUnusableError(error);
  return {
    tokenPresent: blobTokenPresent(),
    usable: false,
    reason: unusable ? "suspended" : "unreachable",
    message: unusable ? BLOB_STORE_UNAVAILABLE_MESSAGE : formatBlobWriteError(error),
  };
}

export function noteBlobFailure(error: unknown) {
  if (!blobTokenPresent()) {
    writeCache({
      at: Date.now(),
      ttl: HEALTHY_TTL_MS,
      value: {
        tokenPresent: false,
        usable: false,
        reason: "no-token",
        message: "Blob is not configured on this deploy.",
      },
    });
    return;
  }
  if (!isBlobUnusableError(error) && !isTimeoutError(error)) return;
  const value = availabilityFromError(error);
  writeCache({
    at: Date.now(),
    ttl: value.reason === "suspended" ? UNUSABLE_TTL_MS : UNREACHABLE_TTL_MS,
    value,
  });
}

function isTimeoutError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return name === "TimeoutError" || name === "AbortError" || /timed out|timeout|aborted/i.test(msg);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  const timeout = new Promise<never>((_, reject) => {
    const err = new Error(`${label} timed out`);
    err.name = "TimeoutError";
    ac.signal.addEventListener("abort", () => reject(err), { once: true });
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function probeStore(): Promise<BlobAvailability> {
  if (!blobTokenPresent()) {
    return {
      tokenPresent: false,
      usable: false,
      reason: "no-token",
      message: "Blob is not configured on this deploy.",
    };
  }

  try {
    await withTimeout(head(HEALTH_PATH, { abortSignal: AbortSignal.timeout(PROBE_MS) }), PROBE_MS, "Blob health check");
    return { tokenPresent: true, usable: true, reason: "ok", message: null };
  } catch (error) {
    if (error instanceof BlobNotFoundError || (error instanceof Error && error.name === "BlobNotFoundError")) {
      return { tokenPresent: true, usable: true, reason: "ok", message: null };
    }
    const value = availabilityFromError(error);
    if (value.reason === "unreachable" && !isTimeoutError(error) && !isBlobUnusableError(error)) {
      return {
        tokenPresent: true,
        usable: false,
        reason: "error",
        message: formatBlobWriteError(error) || BLOB_STORE_UNAVAILABLE_MESSAGE,
      };
    }
    return value;
  }
}

export async function getBlobAvailability(options?: { force?: boolean }): Promise<BlobAvailability> {
  const cached = readCache();
  if (!options?.force && cacheFresh(cached) && cached) return cached.value;
  if (inflight) return inflight;

  inflight = (async () => {
    const value = await probeStore();
    writeCache({
      at: Date.now(),
      ttl: value.usable ? HEALTHY_TTL_MS : value.reason === "suspended" ? UNUSABLE_TTL_MS : UNREACHABLE_TTL_MS,
      value,
    });
    return value;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export async function blobUsable() {
  if (!blobTokenPresent()) return false;
  if (blobCircuitOpen()) return false;
  const status = await getBlobAvailability();
  return status.usable;
}
