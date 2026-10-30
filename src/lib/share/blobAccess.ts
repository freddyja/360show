import { BlobAccessError, BlobNotFoundError, get, put } from "@vercel/blob";
import {
  formatBlobWriteError,
  isBlobAccessMismatch as isMismatchMessage,
  isBlobUnusableError,
  type BlobAccess,
} from "@/lib/share/access";
import { blobCircuitOpen, noteBlobFailure } from "@/lib/share/blobStatus";

export {
  blobFileProxyPath,
  formatBlobWriteError,
  isBlobAccessMismatch,
  isPrivateBlobUrl,
  type BlobAccess,
} from "@/lib/share/access";

const PROBE_PATH = "shares/_access-probe.json";

let cachedAccess: BlobAccess | null = null;

export function blobAccessFromEnv(): BlobAccess | null {
  const raw = (process.env.BLOB_ACCESS || process.env.BLOB_STORE_ACCESS || "").trim().toLowerCase();
  if (raw === "public" || raw === "private") return raw;
  return null;
}

export function rememberBlobAccess(access: BlobAccess) {
  cachedAccess = access;
}

function isMismatch(error: unknown) {
  return error instanceof BlobAccessError || isMismatchMessage(error);
}

function isNotFound(error: unknown) {
  return error instanceof BlobNotFoundError || (error instanceof Error && error.name === "BlobNotFoundError");
}

function accessOrder(preferred: BlobAccess | null): BlobAccess[] {
  return preferred === "private" ? ["private", "public"] : ["public", "private"];
}

/**
 * Resolve the access mode the connected Blob store accepts.
 * Prefer BLOB_ACCESS, then an in-process cache, then a tiny put probe.
 * Does not call Blob `list` (Hobby Advanced Ops).
 */
export async function resolveBlobAccess(): Promise<BlobAccess> {
  const fromEnv = blobAccessFromEnv();
  if (fromEnv) {
    cachedAccess = fromEnv;
    return fromEnv;
  }
  if (cachedAccess) return cachedAccess;
  if (blobCircuitOpen()) {
    throw new Error(formatBlobWriteError(new Error("This store has been suspended.")));
  }

  const body = JSON.stringify({ probedAt: Date.now() });
  let lastError: unknown;
  for (const access of accessOrder(null)) {
    try {
      await put(PROBE_PATH, body, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      cachedAccess = access;
      return access;
    } catch (error) {
      lastError = error;
      noteBlobFailure(error);
      if (isBlobUnusableError(error) || !isMismatch(error)) throw error;
    }
  }

  throw new Error(
    formatBlobWriteError(lastError) ||
      "Vercel Blob is configured but neither public nor private writes succeeded. Check BLOB_READ_WRITE_TOKEN and store access.",
  );
}

export async function getWithStoreAccess(pathname: string) {
  if (blobCircuitOpen()) return null;
  const preferred = blobAccessFromEnv() || cachedAccess;
  let lastError: unknown;
  for (const access of accessOrder(preferred)) {
    try {
      const result = await get(pathname, { access });
      if (!result || result.statusCode !== 200) continue;
      rememberBlobAccess(access);
      return result;
    } catch (error) {
      lastError = error;
      if (isNotFound(error)) return null;
      noteBlobFailure(error);
      if (isBlobUnusableError(error) || blobCircuitOpen()) return null;
      if (!isMismatch(error)) break;
    }
  }
  if (lastError && isBlobUnusableError(lastError)) return null;
  return null;
}

export async function putWithStoreAccess(
  pathname: string,
  body: string | Buffer | Blob,
  extra: { contentType?: string } = {},
) {
  if (blobCircuitOpen()) {
    throw new Error(formatBlobWriteError(new Error("This store has been suspended.")));
  }
  const preferred = await resolveBlobAccess().catch(() => blobAccessFromEnv() || cachedAccess || "public");
  let lastError: unknown;
  for (const access of accessOrder(preferred)) {
    try {
      const blob = await put(pathname, body, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: extra.contentType,
      });
      rememberBlobAccess(access);
      return { blob, access };
    } catch (error) {
      lastError = error;
      noteBlobFailure(error);
      if (isBlobUnusableError(error) || !isMismatch(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(formatBlobWriteError(lastError));
}
