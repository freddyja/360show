import { r2Configured, R2_NOT_CONFIGURED_MESSAGE, R2_UNAVAILABLE_MESSAGE } from "./env";
import { isR2NotFound, r2Head } from "./objects";

const HEALTHY_TTL_MS = 15 * 60_000;
const UNUSABLE_TTL_MS = 60_000;
const PROBE_MS = 4_000;
const HEALTH_PATH = "shares/_360show-r2-health";

export type R2Availability = {
  configured: boolean;
  usable: boolean;
  message: string | null;
};

type CacheEntry = { at: number; ttl: number; value: R2Availability };

const g = globalThis as unknown as { __360showR2Status?: CacheEntry };
let inflight: Promise<R2Availability> | null = null;

function cacheFresh(entry: CacheEntry | null) {
  return Boolean(entry && Date.now() - entry.at < entry.ttl);
}

export function r2CircuitOpen() {
  const entry = g.__360showR2Status ?? null;
  return Boolean(entry && !entry.value.usable && cacheFresh(entry));
}

export function noteR2Failure(error: unknown) {
  if (!r2Configured()) return;
  const msg = error instanceof Error ? error.message : String(error ?? R2_UNAVAILABLE_MESSAGE);
  g.__360showR2Status = {
    at: Date.now(),
    ttl: UNUSABLE_TTL_MS,
    value: { configured: true, usable: false, message: msg || R2_UNAVAILABLE_MESSAGE },
  };
}

async function probe(): Promise<R2Availability> {
  if (!r2Configured()) {
    return { configured: false, usable: false, message: R2_NOT_CONFIGURED_MESSAGE };
  }
  try {
    await Promise.race([
      r2Head(HEALTH_PATH),
      new Promise<never>((_, reject) => {
        const err = new Error("R2 health check timed out");
        err.name = "TimeoutError";
        setTimeout(() => reject(err), PROBE_MS);
      }),
    ]);
    return { configured: true, usable: true, message: null };
  } catch (error) {
    if (isR2NotFound(error)) {
      return { configured: true, usable: true, message: null };
    }
    return {
      configured: true,
      usable: false,
      message: error instanceof Error ? error.message : R2_UNAVAILABLE_MESSAGE,
    };
  }
}

export async function getR2Availability(options?: { force?: boolean }): Promise<R2Availability> {
  const cached = g.__360showR2Status ?? null;
  if (!options?.force && cacheFresh(cached) && cached) return cached.value;
  if (!r2Configured()) {
    return { configured: false, usable: false, message: R2_NOT_CONFIGURED_MESSAGE };
  }
  if (inflight) return inflight;
  inflight = (async () => {
    const value = await probe();
    g.__360showR2Status = {
      at: Date.now(),
      ttl: value.usable ? HEALTHY_TTL_MS : UNUSABLE_TTL_MS,
      value,
    };
    return value;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function r2Usable() {
  if (!r2Configured()) return false;
  if (r2CircuitOpen()) return false;
  return (await getR2Availability()).usable;
}
