import { FRAME_STYLE_IDS, type BoothEvent, type Clip, type FrameStyleId, type RampProfileId } from "@/lib/types";

export interface CloudShare {
  clipId: string;
  eventId: string;
  eventName: string;
  clientNames: string;
  date: string;
  accentColor: string;
  logoDataUrl: string | null;
  frameStyle: FrameStyleId;
  createdAt: number;
  durationMs: number;
  source: Clip["source"];
  rampProfile: RampProfileId;
  videoUrl: string;
  videoContentType: string;
  thumbnailDataUrl: string | null;
  demoAssetPath: string | null;
  /** True when videoUrl is a ramp-baked export (slow-mo is in the file). */
  baked?: boolean;
  /** False when the operator turned slow-mo off; guests should play at 1×. */
  slowMoEnabled?: boolean;
  destination?: "blob" | "drive";
  driveFileId?: string | null;
  webViewLink?: string | null;
}

export interface ShareConfig {
  origin: string;
  blobConfigured: boolean;
  driveConfigured: boolean;
  driveConnected: boolean;
  driveEmail: string | null;
}

export function isClipId(value: string) {
  return /^[A-Za-z0-9._-]{6,96}$/.test(value);
}

export function isFrameStyleId(value: string): value is FrameStyleId {
  return (FRAME_STYLE_IDS as readonly string[]).includes(value);
}

export function shareMetaPath(clipId: string) {
  return `shares/${clipId}/meta.json`;
}

export function shareVideoPath(clipId: string, contentType: string) {
  const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("quicktime") ? "mov" : "webm";
  return `shares/${clipId}/export.${ext}`;
}

export function eventFromCloud(share: CloudShare): BoothEvent {
  return {
    id: share.eventId,
    name: share.eventName,
    date: share.date,
    clientNames: share.clientNames,
    accentColor: share.accentColor,
    logoDataUrl: share.logoDataUrl,
    musicBedLabel: "None",
    frameStyle: share.frameStyle,
    createdAt: share.createdAt,
    updatedAt: share.createdAt,
  };
}

export function clipFromCloud(share: CloudShare): Clip {
  return {
    id: share.clipId,
    eventId: share.eventId,
    createdAt: share.createdAt,
    durationMs: share.durationMs,
    source: share.source,
    hasBlob: false,
    demoAssetPath: share.demoAssetPath,
    thumbnailDataUrl: share.thumbnailDataUrl,
    rampProfile: share.rampProfile,
    remoteVideoUrl: share.videoUrl,
    cloudShareAt: Date.now(),
    hasBakedBlob: Boolean(share.baked),
  };
}

export function cloudShareFrom(
  event: BoothEvent,
  clip: Clip,
  videoUrl: string,
  videoContentType: string,
  baked = true,
  extra?: Pick<CloudShare, "destination" | "driveFileId" | "webViewLink" | "slowMoEnabled">,
): CloudShare {
  return {
    clipId: clip.id,
    eventId: event.id,
    eventName: event.name,
    clientNames: event.clientNames,
    date: event.date,
    accentColor: event.accentColor,
    logoDataUrl: event.logoDataUrl,
    frameStyle: event.frameStyle,
    createdAt: clip.createdAt,
    durationMs: clip.durationMs,
    source: clip.source,
    rampProfile: clip.rampProfile,
    videoUrl,
    videoContentType,
    thumbnailDataUrl: clip.thumbnailDataUrl,
    demoAssetPath: clip.demoAssetPath,
    baked,
    slowMoEnabled: extra?.slowMoEnabled ?? baked,
    destination: extra?.destination,
    driveFileId: extra?.driveFileId,
    webViewLink: extra?.webViewLink,
  };
}
