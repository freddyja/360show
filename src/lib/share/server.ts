import { get, list } from "@vercel/blob";
import { r2Configured } from "@/lib/r2/env";
import { r2GetBytes, r2GetJson, r2PutJson } from "@/lib/r2/objects";
import { noteR2Failure, r2Usable } from "@/lib/r2/status";
import { resolveCloudObjectStore } from "@/lib/storage/cloudStore";
import type { CloudShare } from "@/lib/share/types";
import { isClipId, isFrameStyleId, shareMetaPath, shareVideoPath } from "@/lib/share/types";
import {
  blobFileProxyPath,
  isPrivateBlobUrl,
  putWithStoreAccess,
  resolveBlobAccess,
  type BlobAccess,
} from "@/lib/share/blobAccess";
import { isBlobUnusableError } from "@/lib/share/access";
import { blobCircuitOpen, blobConfigured, blobUsable, noteBlobFailure } from "@/lib/share/blobStatus";

export { blobConfigured, blobTokenPresent, blobUsable, getBlobAvailability } from "@/lib/share/blobStatus";

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

async function readCloudShareFromBlob(clipId: string): Promise<CloudShare | null> {
  if (!blobConfigured() || !isClipId(clipId)) return null;
  const pathname = shareMetaPath(clipId);

  try {
    const { blobs } = await list({ prefix: `shares/${clipId}/`, limit: 20, abortSignal: AbortSignal.timeout(5_000) });
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
  } catch (error) {
    noteBlobFailure(error);
    if (isBlobUnusableError(error) || blobCircuitOpen()) return null;
    try {
      const access = await resolveBlobAccess();
      const result = await get(pathname, { access });
      if (!result || result.statusCode !== 200) return null;
      return parseShareStream(result.stream);
    } catch (inner) {
      noteBlobFailure(inner);
      return null;
    }
  }
}

async function readCloudShareFromR2(clipId: string): Promise<CloudShare | null> {
  if (!r2Configured() || !isClipId(clipId)) return null;
  try {
    const data = await r2GetJson<CloudShare>(shareMetaPath(clipId));
    return data ? hydrateShare(data) : null;
  } catch (error) {
    noteR2Failure(error);
    return null;
  }
}

export async function readCloudShare(clipId: string): Promise<CloudShare | null> {
  if (!isClipId(clipId)) return null;
  const store = await resolveCloudObjectStore();
  if (store === "blob") {
    return (await readCloudShareFromBlob(clipId)) ?? (await readCloudShareFromR2(clipId));
  }
  if (store === "r2") {
    return (await readCloudShareFromR2(clipId)) ?? (await readCloudShareFromBlob(clipId));
  }
  if (r2Configured()) {
    const fromR2 = await readCloudShareFromR2(clipId);
    if (fromR2) return fromR2;
  }
  return readCloudShareFromBlob(clipId);
}

export async function writeCloudShare(share: CloudShare) {
  const payload: CloudShare = isPrivateBlobUrl(share.videoUrl)
    ? { ...share, videoUrl: blobFileProxyPath(share.clipId) }
    : share;
  const store = await resolveCloudObjectStore();
  if (store === "blob") {
    try {
      return await putWithStoreAccess(shareMetaPath(share.clipId), JSON.stringify(payload), {
        contentType: "application/json",
      });
    } catch (error) {
      noteBlobFailure(error);
      throw error;
    }
  }
  if (store === "r2") {
    try {
      return await r2PutJson(shareMetaPath(share.clipId), payload);
    } catch (error) {
      noteR2Failure(error);
      throw error;
    }
  }
  throw new Error("Cloud storage is not configured.");
}

async function readShareVideoFromBlob(clipId: string) {
  if (!blobConfigured() || !isClipId(clipId)) return null;
  try {
    const { blobs } = await list({ prefix: `shares/${clipId}/`, limit: 20, abortSignal: AbortSignal.timeout(5_000) });
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
  } catch (error) {
    noteBlobFailure(error);
    return null;
  }
}

const VIDEO_CANDIDATES = ["video/mp4", "video/webm", "video/quicktime"] as const;

async function readShareVideoFromR2(clipId: string) {
  if (!r2Configured() || !isClipId(clipId)) return null;
  try {
    const meta = await r2GetJson<CloudShare>(shareMetaPath(clipId));
    const paths = [
      meta?.videoContentType ? shareVideoPath(clipId, meta.videoContentType) : null,
      ...VIDEO_CANDIDATES.map((type) => shareVideoPath(clipId, type)),
      `shares/${clipId}/video.webm`,
    ].filter((path, index, list): path is string => Boolean(path) && list.indexOf(path) === index);

    for (const pathname of paths) {
      const file = await r2GetBytes(pathname);
      if (!file) continue;
      return {
        stream: new Blob([new Uint8Array(file.bytes)], { type: file.contentType }).stream(),
        contentType: file.contentType || meta?.videoContentType || "video/webm",
        size: file.bytes.length,
        contentDisposition: file.contentDisposition || "inline",
      };
    }
    return null;
  } catch (error) {
    noteR2Failure(error);
    return null;
  }
}

export async function readShareVideo(clipId: string) {
  if (!isClipId(clipId)) return null;
  const store = await resolveCloudObjectStore();
  if (store === "blob") {
    return (await readShareVideoFromBlob(clipId)) ?? (await readShareVideoFromR2(clipId));
  }
  if (store === "r2") {
    return (await readShareVideoFromR2(clipId)) ?? (await readShareVideoFromBlob(clipId));
  }
  if (await r2Usable()) return readShareVideoFromR2(clipId);
  if (await blobUsable()) return readShareVideoFromBlob(clipId);
  return null;
}
