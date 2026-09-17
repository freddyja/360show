export type BlobAccess = "public" | "private";

export function isPrivateBlobUrl(url: string | null | undefined) {
  return Boolean(url && url.includes(".private.blob.vercel-storage.com"));
}

export function blobFileProxyPath(clipId: string) {
  return `/api/share/${encodeURIComponent(clipId)}/file`;
}

export function isBlobAccessMismatch(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "BlobAccessError") return true;
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /forbidden|access denied|not allowed|private store|public store|access type|x-vercel-blob-access/i.test(
    msg,
  );
}

export function formatBlobWriteError(error: unknown): string {
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
