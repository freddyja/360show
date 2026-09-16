import { get, list } from "@vercel/blob";
import type { CloudShare } from "@/lib/share/types";
import { isClipId, isFrameStyleId, shareMetaPath } from "@/lib/share/types";
import {
  blobFileProxyPath,
  isPrivateBlobUrl,
  putWithStoreAccess,
  resolveBlobAccess,
  type BlobAccess,
} from "@/lib/share/blobAccess";

export function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function hydrateShare(data: CloudShare): CloudShare | null {
  if (!data?.clipId || !data.videoUrl || !isFrameStyleId(data.frameStyle)) return null;
  if (data.destination === "drive") return data;
  if (isPrivateBlobUrl(data.videoUrl)) {
    return { ...data, videoUrl: blobFileProxyPath(data.clipId) };
  }
  return data;
}

async function parseShareStream(stream: ReadableStream<Uint8Array> | null): Promise<CloudShare | null> {
  if (!stream) return null;
  const data = (await new Response(stream).json()) as CloudShare;
  return hydrateShare(data);
}

export async function readCloudShare(clipId: string): Promise<CloudShare | null> {
  if (!blobConfigured() || !isClipId(clipId)) return null;
  const pathname = shareMetaPath(clipId);

  try {
    const { blobs } = await list({ prefix: `shares/${clipId}/`, limit: 20 });
    const meta = blobs.find((item) => item.pathname === pathname || item.pathname.endsWith("/meta.json"));
    if (!meta) return null;

    const listedUrl = meta.url || "";
    if (listedUrl.includes(".private.")) {
      const result = await get(meta.pathname || pathname, { access: "private" });
      if (!result || result.statusCode !== 200) return null;
      return parseShareStream(result.stream);
    }

    const res = await fetch(meta.url, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as CloudShare;
      return hydrateShare(data);
    }

    const result = await get(meta.pathname || pathname, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return parseShareStream(result.stream);
  } catch {
    try {
      const access = await resolveBlobAccess();
      const result = await get(pathname, { access });
      if (!result || result.statusCode !== 200) return null;
      return parseShareStream(result.stream);
    } catch {
      return null;
    }
  }
}

export async function writeCloudShare(share: CloudShare) {
  const payload: CloudShare = isPrivateBlobUrl(share.videoUrl)
    ? { ...share, videoUrl: blobFileProxyPath(share.clipId) }
    : share;
  return putWithStoreAccess(shareMetaPath(share.clipId), JSON.stringify(payload), {
    contentType: "application/json",
  });
}

export async function readShareVideo(clipId: string) {
  if (!blobConfigured() || !isClipId(clipId)) return null;
  const { blobs } = await list({ prefix: `shares/${clipId}/`, limit: 20 });
  const video = blobs.find((item) => /\/(video|export)\.(webm|mp4|mov)$/i.test(item.pathname));
  if (!video) return null;
  const access: BlobAccess = video.url.includes(".private.") ? "private" : "public";
  const result = await get(video.pathname, { access });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return {
    stream: result.stream,
    contentType: result.blob.contentType || "video/webm",
    size: result.blob.size,
    contentDisposition: result.blob.contentDisposition || "inline",
  };
}
