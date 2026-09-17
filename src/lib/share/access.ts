export type BlobAccess = "public" | "private";

export const BLOB_CLOUD_UNAVAILABLE_MESSAGE =
  "Cloud share via Vercel Blob is temporarily unavailable. Download still works on this tablet.";

export const BLOB_STORE_UNAVAILABLE_MESSAGE =
  "Vercel Blob is temporarily unavailable (store suspended or over Hobby limits).";

export function isPrivateBlobUrl(url: string | null | undefined) {
  return Boolean(url && url.includes(".private.blob.vercel-storage.com"));
}

export function blobFileProxyPath(clipId: string) {
  return `/api/share/${encodeURIComponent(clipId)}/file`;
}

export function blobErrorText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.trim();
  }
  return String(error ?? "");
}

/** Store is suspended, blocked, over Hobby limits, or otherwise not writable. */
export function isBlobUnusableError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (
    name === "BlobStoreSuspendedError" ||
    name === "BlobStoreNotFoundError" ||
    name === "BlobServiceNotAvailable"
  ) {
    return true;
  }
  const msg = blobErrorText(error);
  return /store has been suspended|store_suspended|limits-exceeded-suspended|limits reached|your store is blocked|store is blocked|usage_threshold|billingstate[:\s]*suspended|this store has been suspended|blob.*suspended|advanced operations quota|over (the )?hobby (plan )?limit/i.test(
    msg,
  );
}

export function isBlobAccessMismatch(error: unknown) {
  if (isBlobUnusableError(error)) return false;
  const name = error instanceof Error ? error.name : "";
  if (name === "BlobAccessError") return true;
  const msg = blobErrorText(error);
  return /forbidden|access denied|not allowed|private store|public store|access type|x-vercel-blob-access/i.test(
    msg,
  );
}

export function formatBlobWriteError(error: unknown): string {
  if (isBlobUnusableError(error)) {
    return BLOB_STORE_UNAVAILABLE_MESSAGE;
  }
  const raw = error instanceof Error ? error.message : String(error ?? "unknown error");
  if (isBlobAccessMismatch(error)) {
    return (
      `Vercel Blob rejected the write: ${raw} ` +
      "Private stores require access=private (set BLOB_ACCESS=private on Vercel). " +
      "Public stores require access=public. Recreate the store as public if you want unauthenticated CDN URLs."
    );
  }
  return raw;
}
