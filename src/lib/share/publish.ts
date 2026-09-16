"use client";

import { upload } from "@vercel/blob/client";
import { uploadClipToDrive } from "@/lib/drive/uploadClient";
import { DEMO_ASSET_PATH, type BoothEvent, type Clip } from "@/lib/types";
import {
  blobFileProxyPath,
  formatBlobWriteError,
  isBlobAccessMismatch,
  isPrivateBlobUrl,
  type BlobAccess,
} from "@/lib/share/access";
import { cloudShareFrom, shareVideoPath, type CloudShare, type ShareConfig } from "@/lib/share/types";

type PersistMetaResponse = { ok?: boolean; stored?: string; warning?: string; error?: string };

function playbackVideoUrl(clipId: string, videoUrl: string) {
  return isPrivateBlobUrl(videoUrl) ? blobFileProxyPath(clipId) : videoUrl;
}

function driveShareComplete(payload: CloudShare) {
  return payload.destination === "drive" && Boolean(payload.driveFileId || payload.webViewLink);
}

export async function fetchShareConfig(): Promise<ShareConfig> {
  const res = await fetch("/api/share/config", { cache: "no-store" });
  if (!res.ok) {
    return {
      origin: window.location.origin,
      blobConfigured: false,
      blobAccess: null,
      blobAccessError: null,
      driveConfigured: false,
      driveConnected: false,
      driveEmail: null,
    };
  }
  const data = (await res.json()) as Partial<ShareConfig>;
  return {
    origin: data.origin || window.location.origin,
    blobConfigured: Boolean(data.blobConfigured),
    blobAccess: data.blobAccess === "private" || data.blobAccess === "public" ? data.blobAccess : null,
    blobAccessError: data.blobAccessError ?? null,
    driveConfigured: Boolean(data.driveConfigured),
    driveConnected: Boolean(data.driveConnected),
    driveEmail: data.driveEmail ?? null,
  };
}

export async function fetchCloudShare(clipId: string): Promise<CloudShare | null> {
  const res = await fetch(`/api/share/${encodeURIComponent(clipId)}`, { cache: "no-store" });
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) return null;
  return (await res.json()) as CloudShare;
}

export async function fileForUpload(clip: Clip, localBlob: Blob | null): Promise<{ file: File; contentType: string } | null> {
  const normalize = (type: string) => (type.includes("mp4") ? "video/mp4" : "video/webm");
  if (localBlob && localBlob.size > 500) {
    const contentType = normalize(localBlob.type || "video/webm");
    const ext = contentType.includes("mp4") ? "mp4" : "webm";
    return {
      file: new File([localBlob], `${clip.id}.${ext}`, { type: contentType }),
      contentType,
    };
  }
  const demoPath = clip.demoAssetPath || DEMO_ASSET_PATH;
  try {
    const res = await fetch(demoPath);
    if (!res.ok) return null;
    const blob = await res.blob();
    const contentType = blob.type || "video/mp4";
    return {
      file: new File([blob], `${clip.id}.mp4`, { type: contentType }),
      contentType,
    };
  } catch {
    return null;
  }
}

async function persistShareMeta(payload: CloudShare, options?: { allowDriveFallback?: boolean }): Promise<CloudShare> {
  const res = await fetch(`/api/share/${encodeURIComponent(payload.clipId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => null)) as PersistMetaResponse | null;
  if (res.ok) {
    return {
      ...payload,
      metaStored: body?.stored === "blob",
      warning: body?.warning,
    };
  }
  const message = body?.error || "Could not save share metadata";
  if (options?.allowDriveFallback && driveShareComplete(payload)) {
    return {
      ...payload,
      metaStored: false,
      warning: message,
    };
  }
  throw new Error(message);
}

async function uploadVideoToBlob(pathname: string, file: File, preferred: BlobAccess | null) {
  const order: BlobAccess[] =
    preferred === "private" ? ["private", "public"] : ["public", "private"];
  let lastError: unknown;
  for (const access of order) {
    try {
      return await upload(pathname, file, {
        access,
        handleUploadUrl: "/api/share/upload",
        multipart: true,
      });
    } catch (error) {
      lastError = error;
      if (!isBlobAccessMismatch(error)) {
        throw new Error(formatBlobWriteError(error));
      }
    }
  }
  throw new Error(formatBlobWriteError(lastError));
}

export async function publishClipToCloud(options: {
  event: BoothEvent;
  clip: Clip;
  localBlob: Blob | null;
  baked?: boolean;
  slowMoEnabled?: boolean;
  blobAccess?: BlobAccess | null;
  existing?: Pick<CloudShare, "videoUrl" | "videoContentType" | "baked" | "destination" | "driveFileId" | "webViewLink" | "slowMoEnabled"> | CloudShare | null;
}): Promise<CloudShare> {
  const { event, clip, localBlob, existing } = options;
  const baked = options.baked ?? true;
  const slowMoEnabled = options.slowMoEnabled ?? baked;
  const reusable = Boolean(
    existing?.destination !== "drive" &&
      existing?.baked === baked &&
      (existing?.slowMoEnabled ?? true) === slowMoEnabled &&
      (existing.videoUrl || clip.remoteVideoUrl),
  );
  let videoUrl = reusable ? existing?.videoUrl || clip.remoteVideoUrl || "" : "";
  let videoContentType = reusable ? existing?.videoContentType || "video/webm" : "video/webm";

  if (!videoUrl) {
    const prepared = await fileForUpload(clip, localBlob);
    if (!prepared) {
      throw new Error("Nothing to upload — capture a spin first.");
    }
    const pathname = shareVideoPath(clip.id, prepared.contentType);
    const preferred = options.blobAccess ?? (await fetchShareConfig()).blobAccess ?? null;
    const uploaded = await uploadVideoToBlob(pathname, prepared.file, preferred);
    videoUrl = playbackVideoUrl(clip.id, uploaded.url);
    videoContentType = prepared.contentType;
  } else {
    videoUrl = playbackVideoUrl(clip.id, videoUrl);
  }

  return persistShareMeta(
    cloudShareFrom(event, clip, videoUrl, videoContentType, baked, {
      destination: "blob",
      slowMoEnabled,
    }),
  );
}

export async function publishClipToDrive(options: {
  event: BoothEvent;
  clip: Clip;
  localBlob: Blob | null;
  folderName: string;
  baked?: boolean;
  slowMoEnabled?: boolean;
  existing?: Pick<CloudShare, "videoUrl" | "videoContentType" | "baked" | "destination" | "driveFileId" | "webViewLink" | "slowMoEnabled"> | CloudShare | null;
}): Promise<CloudShare> {
  const { event, clip, localBlob, folderName, existing } = options;
  const baked = options.baked ?? true;
  const slowMoEnabled = options.slowMoEnabled ?? baked;
  const reusable = Boolean(
    existing?.destination === "drive" &&
      existing?.baked === baked &&
      (existing?.slowMoEnabled ?? true) === slowMoEnabled &&
      existing.driveFileId &&
      existing.videoUrl,
  );

  if (reusable && existing?.videoUrl) {
    return persistShareMeta(
      cloudShareFrom(event, clip, existing.videoUrl, existing.videoContentType || "video/webm", baked, {
        destination: "drive",
        driveFileId: existing.driveFileId,
        webViewLink: existing.webViewLink,
        slowMoEnabled,
      }),
      { allowDriveFallback: true },
    );
  }

  const prepared = await fileForUpload(clip, localBlob);
  if (!prepared) {
    throw new Error("Nothing to upload — capture a spin first.");
  }

  const tokenRes = await fetch("/api/drive/token", { cache: "no-store" });
  const tokenBody = (await tokenRes.json().catch(() => null)) as { accessToken?: string; error?: string } | null;
  if (!tokenRes.ok || !tokenBody?.accessToken) {
    throw new Error(tokenBody?.error || "Connect Google Drive in Settings before sharing.");
  }

  const uploaded = await uploadClipToDrive({
    accessToken: tokenBody.accessToken,
    file: prepared.file,
    folderName,
    eventName: event.name,
    clipId: clip.id,
  });

  return persistShareMeta(
    cloudShareFrom(event, clip, uploaded.previewUrl, prepared.contentType, baked, {
      destination: "drive",
      driveFileId: uploaded.fileId,
      webViewLink: uploaded.webViewLink,
      slowMoEnabled,
    }),
    { allowDriveFallback: true },
  );
}
