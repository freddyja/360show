import { BlobAccessError, list, put } from "@vercel/blob";
import {
  formatBlobWriteError,
  isBlobAccessMismatch as isMismatchMessage,
  type BlobAccess,
} from "@/lib/share/access";

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

function accessFromBlobUrl(url: string | undefined): BlobAccess | null {
  if (!url) return null;
  if (url.includes(".private.")) return "private";
  if (url.includes(".public.")) return "public";
  return null;
}

/**
 * Resolve the access mode the connected Blob store accepts.
 * Prefer BLOB_ACCESS; otherwise infer from existing objects, then probe public then private.
 */
export async function resolveBlobAccess(): Promise<BlobAccess> {
  const fromEnv = blobAccessFromEnv();
  if (fromEnv) {
    cachedAccess = fromEnv;
    return fromEnv;
  }
  if (cachedAccess) return cachedAccess;

  try {
    const { blobs } = await list({ limit: 8 });
    for (const item of blobs) {
      const inferred = accessFromBlobUrl(item.url);
      if (inferred) {
        cachedAccess = inferred;
        return inferred;
      }
    }
  } catch {
    // Empty or unlistable store — probe with a tiny put.
  }

  const body = JSON.stringify({ probedAt: Date.now() });
  const attempts: BlobAccess[] = ["public", "private"];
  let lastError: unknown;
  for (const access of attempts) {
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
      if (!isMismatch(error)) throw error;
    }
  }

  throw new Error(
    formatBlobWriteError(lastError) ||
      "Vercel Blob is configured but neither public nor private writes succeeded. Check BLOB_READ_WRITE_TOKEN and store access.",
  );
}

export async function putWithStoreAccess(
  pathname: string,
  body: string | Buffer | Blob,
  extra: { contentType?: string } = {},
) {
  const preferred = await resolveBlobAccess().catch(() => blobAccessFromEnv() || cachedAccess || "public");
  const order: BlobAccess[] = preferred === "private" ? ["private", "public"] : ["public", "private"];
  let lastError: unknown;
  for (const access of order) {
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
      if (!isMismatch(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(formatBlobWriteError(lastError));
}
