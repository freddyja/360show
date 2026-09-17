import { BLOB_CLOUD_UNAVAILABLE_MESSAGE } from "@/lib/share/access";
import type { CloudShare } from "@/lib/share/types";
import { isClipId, isFrameStyleId, shareMetaPath, shareVideoPath } from "@/lib/share/types";
import {
  blobFileProxyPath,
  getWithStoreAccess,
  isPrivateBlobUrl,
  putWithStoreAccess,
} from "@/lib/share/blobAccess";
import { blobCircuitOpen, blobConfigured, noteBlobFailure } from "@/lib/share/blobStatus";

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

export async function readCloudShare(clipId: string): Promise<CloudShare | null> {
  if (!blobConfigured() || !isClipId(clipId)) return null;
  try {
    const result = await getWithStoreAccess(shareMetaPath(clipId));
    if (!result || result.statusCode !== 200) return null;
    return parseShareStream(result.stream);
  } catch (error) {
    noteBlobFailure(error);
    if (blobCircuitOpen()) return null;
    return null;
  }
}

export async function writeCloudShare(share: CloudShare) {
  if (!blobConfigured()) {
    throw new Error(BLOB_CLOUD_UNAVAILABLE_MESSAGE);
  }
  const payload: CloudShare = isPrivateBlobUrl(share.videoUrl)
    ? { ...share, videoUrl: blobFileProxyPath(share.clipId) }
    : share;
  try {
    return await putWithStoreAccess(shareMetaPath(share.clipId), JSON.stringify(payload), {
      contentType: "application/json",
    });
  } catch (error) {
    noteBlobFailure(error);
    throw error;
  }
}

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export async function readShareVideo(clipId: string) {
  if (!blobConfigured() || !isClipId(clipId)) return null;
  try {
    const meta = await readCloudShare(clipId);
    const paths = [
      meta?.videoContentType ? shareVideoPath(clipId, meta.videoContentType) : null,
      ...VIDEO_TYPES.map((type) => shareVideoPath(clipId, type)),
      `shares/${clipId}/video.webm`,
    ].filter((path, index, list): path is string => Boolean(path) && list.indexOf(path) === index);

    for (const pathname of paths) {
      const result = await getWithStoreAccess(pathname);
      if (!result || result.statusCode !== 200 || !result.stream) continue;
      return {
        stream: result.stream,
        contentType: result.blob.contentType || meta?.videoContentType || "video/webm",
        size: result.blob.size,
        contentDisposition: result.blob.contentDisposition || "inline",
      };
    }
    return null;
  } catch (error) {
    noteBlobFailure(error);
    return null;
  }
}
