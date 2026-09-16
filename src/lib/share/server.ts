import { put, list } from "@vercel/blob";
import type { CloudShare } from "@/lib/share/types";
import { isClipId, isFrameStyleId, shareMetaPath } from "@/lib/share/types";

export function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readCloudShare(clipId: string): Promise<CloudShare | null> {
  if (!blobConfigured() || !isClipId(clipId)) return null;
  const { blobs } = await list({ prefix: `shares/${clipId}/`, limit: 20 });
  const meta = blobs.find(
    (item) => item.pathname === shareMetaPath(clipId) || item.pathname.endsWith("/meta.json"),
  );
  if (!meta) return null;
  const res = await fetch(meta.url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as CloudShare;
  if (!data?.clipId || !data.videoUrl || !isFrameStyleId(data.frameStyle)) return null;
  return data;
}

export async function writeCloudShare(share: CloudShare) {
  const blob = await put(shareMetaPath(share.clipId), JSON.stringify(share), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return blob;
}
