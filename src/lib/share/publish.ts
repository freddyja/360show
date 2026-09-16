"use client";

import { upload } from "@vercel/blob/client";
import { uploadClipToDrive } from "@/lib/drive/uploadClient";
import { DEMO_ASSET_PATH, type BoothEvent, type Clip } from "@/lib/types";
import { cloudShareFrom, shareVideoPath, type CloudShare, type ShareConfig } from "@/lib/share/types";

export async function fetchShareConfig(): Promise<ShareConfig> {
  const res = await fetch("/api/share/config", { cache: "no-store" });
  if (!res.ok) {
    return {
      origin: window.location.origin,
      blobConfigured: false,
      driveConfigured: false,
      driveConnected: false,
      driveEmail: null,
    };
  }
  const data = (await res.json()) as Partial<ShareConfig>;
  return {
    origin: data.origin || window.location.origin,
    blobConfigured: Boolean(data.blobConfigured),
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

async function persistShareMeta(payload: CloudShare) {
  const res = await fetch(`/api/share/${encodeURIComponent(payload.clipId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error || "Could not save share metadata");
  }
  return payload;
}

export async function publishClipToCloud(options: {
  event: BoothEvent;
  clip: Clip;
  localBlob: Blob | null;
  baked?: boolean;
  slowMoEnabled?: boolean;
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
    const uploaded = await upload(pathname, prepared.file, {
      access: "public",
      handleUploadUrl: "/api/share/upload",
      multipart: true,
    });
    videoUrl = uploaded.url;
    videoContentType = prepared.contentType;
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
  );
}
