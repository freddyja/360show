"use client";

import { upload } from "@vercel/blob/client";
import { DEMO_ASSET_PATH, type BoothEvent, type Clip } from "@/lib/types";
import { cloudShareFrom, shareVideoPath, type CloudShare, type ShareConfig } from "@/lib/share/types";

export async function fetchShareConfig(): Promise<ShareConfig> {
  const res = await fetch("/api/share/config", { cache: "no-store" });
  if (!res.ok) {
    return { origin: window.location.origin, blobConfigured: false };
  }
  return (await res.json()) as ShareConfig;
}

export async function fetchCloudShare(clipId: string): Promise<CloudShare | null> {
  const res = await fetch(`/api/share/${encodeURIComponent(clipId)}`, { cache: "no-store" });
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) return null;
  return (await res.json()) as CloudShare;
}

async function fileForUpload(clip: Clip, localBlob: Blob | null): Promise<{ file: File; contentType: string } | null> {
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

export async function publishClipToCloud(options: {
  event: BoothEvent;
  clip: Clip;
  localBlob: Blob | null;
  existing?: Pick<CloudShare, "videoUrl" | "videoContentType"> | CloudShare | null;
}): Promise<CloudShare> {
  const { event, clip, localBlob, existing } = options;
  let videoUrl = existing?.videoUrl || clip.remoteVideoUrl || "";
  let videoContentType = existing?.videoContentType || "video/webm";

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

  const payload = cloudShareFrom(event, clip, videoUrl, videoContentType);
  const res = await fetch(`/api/share/${encodeURIComponent(clip.id)}`, {
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
