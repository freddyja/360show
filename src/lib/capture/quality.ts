import { VIDEO_QUALITIES, type VideoQuality } from "../types";

export { VIDEO_QUALITIES, type VideoQuality };

export interface VideoQualityProfile {
  id: VideoQuality;
  label: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export const VIDEO_QUALITY_PROFILES: Record<VideoQuality, VideoQualityProfile> = {
  standard: {
    id: "standard",
    label: "Standard · 1280×720",
    width: 1280,
    height: 720,
    fps: 30,
    bitrate: 4_000_000,
  },
  high: {
    id: "high",
    label: "High · 1920×1080",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 8_000_000,
  },
};

const RECORDER_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4;codecs=h264",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function isVideoQuality(value: unknown): value is VideoQuality {
  return (VIDEO_QUALITIES as readonly string[]).includes(value as string);
}

export function resolveVideoQuality(value: unknown): VideoQuality {
  return value === "standard" ? "standard" : "high";
}

export function videoQualityProfile(quality?: VideoQuality | null): VideoQualityProfile {
  return VIDEO_QUALITY_PROFILES[resolveVideoQuality(quality)];
}

export function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function createVideoRecorder(stream: MediaStream, bitrate: number) {
  const mimeType = pickRecorderMimeType();
  const withMime = mimeType
    ? { mimeType, videoBitsPerSecond: bitrate }
    : { videoBitsPerSecond: bitrate };
  try {
    return new MediaRecorder(stream, withMime);
  } catch {
    try {
      return new MediaRecorder(stream, { videoBitsPerSecond: bitrate });
    } catch {
      return new MediaRecorder(stream);
    }
  }
}

/** Scale source pixels to fit inside the quality cap without upscaling. */
export function fitWithinQuality(srcW: number, srcH: number, quality: VideoQuality) {
  const profile = videoQualityProfile(quality);
  const width = srcW || profile.width;
  const height = srcH || profile.height;
  const scale = Math.min(1, profile.width / width, profile.height / height);
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale)),
    fps: profile.fps,
    bitrate: profile.bitrate,
  };
}
