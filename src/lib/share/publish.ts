"use client";

import { upload } from "@vercel/blob/client";
import { uploadClipToDrive } from "@/lib/drive/uploadClient";
import { DEMO_ASSET_PATH, type BoothEvent, type Clip } from "@/lib/types";
import {
  BLOB_CLOUD_UNAVAILABLE_MESSAGE,
  BLOB_STORE_UNAVAILABLE_MESSAGE,
  CLOUD_SHARE_UNAVAILABLE_MESSAGE,
  R2_SETUP_HINT,
  blobFileProxyPath,
  formatBlobWriteError,
  isBlobAccessMismatch,
  isBlobUnusableError,
  isPrivateBlobUrl,
  type BlobAccess,
} from "@/lib/share/access";
import { cloudShareFrom, shareVideoPath, type CloudShare, type ShareConfig } from "@/lib/share/types";
import { contentTypeForVideoBlob } from "@/lib/capture/quality";

type PersistMetaResponse = { ok?: boolean; stored?: string; warning?: string; error?: string };

function playbackVideoUrl(clipId: string, videoUrl: string) {
  return isPrivateBlobUrl(videoUrl) ? blobFileProxyPath(clipId) : videoUrl;
}

function driveShareComplete(payload: CloudShare) {
  return payload.destination === "drive" && Boolean(payload.driveFileId || payload.webViewLink);
}

export async function fetchShareConfig(): Promise<ShareConfig> {
  try {
    const res = await fetch("/api/share/config", { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      return emptyShareConfig();
    }
    const data = (await res.json()) as Partial<ShareConfig>;
    return {
      origin: data.origin || window.location.origin,
      blobConfigured: Boolean(data.blobConfigured),
      blobTokenPresent: Boolean(data.blobTokenPresent),
      blobUnavailableReason: data.blobUnavailableReason ?? null,
      blobAccess: data.blobAccess === "private" || data.blobAccess === "public" ? data.blobAccess : null,
      blobAccessError: data.blobAccessError ?? null,
      r2Configured: Boolean(data.r2Configured),
      r2Usable: Boolean(data.r2Usable),
      r2UnavailableReason: data.r2UnavailableReason ?? null,
      cloudStore: data.cloudStore === "blob" || data.cloudStore === "r2" || data.cloudStore === "none" ? data.cloudStore : "none",
      cloudShareReady: Boolean(data.cloudShareReady ?? data.blobConfigured ?? data.r2Usable),
      cloudShareUnavailableReason: data.cloudShareUnavailableReason ?? null,
      remoteAvailable: data.remoteAvailable,
      remoteStore: data.remoteStore,
      remoteUnavailableReason: data.remoteUnavailableReason ?? null,
      remoteMusicAvailable: data.remoteMusicAvailable,
      driveConfigured: Boolean(data.driveConfigured),
      driveConnected: Boolean(data.driveConnected),
      driveEmail: data.driveEmail ?? null,
    };
  } catch {
    return emptyShareConfig();
  }
}

function emptyShareConfig(): ShareConfig {
  return {
    origin: typeof window !== "undefined" ? window.location.origin : "",
    blobConfigured: false,
    blobTokenPresent: false,
    blobUnavailableReason: BLOB_STORE_UNAVAILABLE_MESSAGE,
    blobAccess: null,
    blobAccessError: null,
    r2Configured: false,
    r2Usable: false,
    r2UnavailableReason: null,
    cloudStore: "none",
    cloudShareReady: false,
    cloudShareUnavailableReason: CLOUD_SHARE_UNAVAILABLE_MESSAGE,
    remoteAvailable: false,
    remoteStore: "none",
    remoteUnavailableReason: null,
    remoteMusicAvailable: false,
    driveConfigured: false,
    driveConnected: false,
    driveEmail: null,
  };
}

export async function fetchCloudShare(clipId: string): Promise<CloudShare | null> {
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(clipId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 404 || res.status === 503) return null;
    if (!res.ok) return null;
    return (await res.json()) as CloudShare;
  } catch {
    return null;
  }
}

export async function fileForUpload(clip: Clip, localBlob: Blob | null): Promise<{ file: File; contentType: string } | null> {
  if (localBlob && localBlob.size > 500) {
    const contentType = await contentTypeForVideoBlob(localBlob, localBlob.type);
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
      metaStored: body?.stored === "blob" || body?.stored === "r2",
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

async function uploadVideoToR2(pathname: string, file: File, clipId: string) {
  const res = await fetch("/api/share/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ store: "r2", pathname, contentType: file.type || "application/octet-stream" }),
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    uploadUrl?: string;
    publicUrl?: string | null;
    pathname?: string;
  } | null;
  if (!res.ok || !body?.uploadUrl) {
    throw new Error(body?.error || CLOUD_SHARE_UNAVAILABLE_MESSAGE);
  }
  const put = await fetch(body.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Cloudflare R2 upload failed (${put.status}). Check bucket CORS for PUT.`);
  }
  return {
    url: body.publicUrl || blobFileProxyPath(clipId),
    pathname: body.pathname || pathname,
  };
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
      if (isBlobUnusableError(error)) {
        throw error;
      }
      if (!isBlobAccessMismatch(error)) {
        throw new Error(formatBlobWriteError(error));
      }
    }
  }
  throw new Error(formatBlobWriteError(lastError));
}

async function uploadShareVideo(pathname: string, file: File, clipId: string, preferred: BlobAccess | null) {
  const config = await fetchShareConfig();
  if (config.blobConfigured) {
    try {
      const uploaded = await uploadVideoToBlob(pathname, file, preferred ?? config.blobAccess);
      return { url: playbackVideoUrl(clipId, uploaded.url) };
    } catch (error) {
      if (!isBlobUnusableError(error) && !(error instanceof Error && error.message === BLOB_CLOUD_UNAVAILABLE_MESSAGE)) {
        throw error instanceof Error ? error : new Error(formatBlobWriteError(error));
      }
      if (!config.r2Usable && !config.r2Configured) {
        throw new Error(BLOB_CLOUD_UNAVAILABLE_MESSAGE);
      }
    }
  }
  if (config.r2Usable || config.cloudStore === "r2" || config.r2Configured) {
    const uploaded = await uploadVideoToR2(pathname, file, clipId);
    return { url: uploaded.url };
  }
  throw new Error(
    config.cloudShareUnavailableReason ||
      `${CLOUD_SHARE_UNAVAILABLE_MESSAGE} ${R2_SETUP_HINT}`,
  );
}

export async function publishClipToCloud(options: {
  event: BoothEvent;
  clip: Clip;
  localBlob: Blob | null;
  baked?: boolean;
  slowMoEnabled?: boolean;
  musicBedLabel?: string;
  hasAudio?: boolean;
  blobAccess?: BlobAccess | null;
  existing?: Pick<CloudShare, "videoUrl" | "videoContentType" | "baked" | "destination" | "driveFileId" | "webViewLink" | "slowMoEnabled" | "musicBedLabel" | "hasAudio"> | CloudShare | null;
}): Promise<CloudShare> {
  const { event, clip, localBlob, existing } = options;
  const baked = options.baked ?? true;
  const slowMoEnabled = options.slowMoEnabled ?? baked;
  const musicBedLabel = options.musicBedLabel ?? event.musicBedLabel;
  const hasAudio = options.hasAudio;
  const reusable = Boolean(
    existing?.destination !== "drive" &&
      existing?.baked === baked &&
      (existing?.slowMoEnabled ?? true) === slowMoEnabled &&
      (existing?.musicBedLabel ?? "None") === (musicBedLabel || "None") &&
      Boolean(existing?.hasAudio) === Boolean(hasAudio) &&
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
    const uploaded = await uploadShareVideo(pathname, prepared.file, clip.id, preferred);
    videoUrl = uploaded.url;
    videoContentType = prepared.contentType;
  } else {
    videoUrl = playbackVideoUrl(clip.id, videoUrl);
  }

  return persistShareMeta(
    cloudShareFrom(event, clip, videoUrl, videoContentType, baked, {
      destination: "blob",
      slowMoEnabled,
      musicBedLabel,
      hasAudio,
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
  musicBedLabel?: string;
  hasAudio?: boolean;
  existing?: Pick<CloudShare, "videoUrl" | "videoContentType" | "baked" | "destination" | "driveFileId" | "webViewLink" | "slowMoEnabled" | "musicBedLabel" | "hasAudio"> | CloudShare | null;
}): Promise<CloudShare> {
  const { event, clip, localBlob, folderName, existing } = options;
  const baked = options.baked ?? true;
  const slowMoEnabled = options.slowMoEnabled ?? baked;
  const musicBedLabel = options.musicBedLabel ?? event.musicBedLabel;
  const hasAudio = options.hasAudio;
  const reusable = Boolean(
    existing?.destination === "drive" &&
      existing?.baked === baked &&
      (existing?.slowMoEnabled ?? true) === slowMoEnabled &&
      (existing?.musicBedLabel ?? "None") === (musicBedLabel || "None") &&
      Boolean(existing?.hasAudio) === Boolean(hasAudio) &&
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
        musicBedLabel,
        hasAudio,
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
      musicBedLabel,
      hasAudio,
    }),
    { allowDriveFallback: true },
  );
}
