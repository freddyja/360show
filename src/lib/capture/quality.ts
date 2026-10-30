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
  "video/mp4;codecs=avc1.4D401E",
  "video/mp4;codecs=avc1",
  "video/mp4;codecs=h264",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

/**
 * MP4 / H.264 + AAC first when mixing a music bed. Do not list video-only
 * avc1/h264 before WebM — that would encode without audio and drop the mix.
 * Drive’s web player often never finishes “processing” WebM; Photos/Drive
 * both want H.264 + AAC. WebM + Opus stays the fallback.
 */
const AV_RECORDER_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.4D401E,mp4a.40.2",
  "video/mp4;codecs=avc1.64001E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
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

export function pickRecorderMimeType(withAudio = false) {
  if (typeof MediaRecorder === "undefined") return "";
  const list = withAudio ? AV_RECORDER_MIME_CANDIDATES : RECORDER_MIME_CANDIDATES;
  return list.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function recorderMimeCandidates(withAudio = false) {
  const list = withAudio ? AV_RECORDER_MIME_CANDIDATES : RECORDER_MIME_CANDIDATES;
  if (typeof MediaRecorder === "undefined") return [];
  return list.filter((type) => MediaRecorder.isTypeSupported(type));
}

export function isWebmContainer(type?: string | null, name?: string | null) {
  const blob = `${type || ""} ${name || ""}`.toLowerCase();
  return blob.includes("webm");
}

function headerLooksLikeMp4(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

function headerLooksLikeWebm(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

function fallbackVideoContentType(reported?: string | null) {
  const value = (reported || "").toLowerCase();
  if (value.includes("mp4") || value.includes("quicktime") || value.includes("m4v")) return "video/mp4";
  return "video/webm";
}

/** Prefer ISO BMFF vs EBML over a lying MediaRecorder mimeType. */
export function sniffVideoContentType(header: ArrayBuffer | Uint8Array, reported?: string | null) {
  const bytes = header instanceof Uint8Array ? header : new Uint8Array(header);
  if (headerLooksLikeMp4(bytes)) return "video/mp4";
  if (headerLooksLikeWebm(bytes)) return "video/webm";
  return fallbackVideoContentType(reported);
}

export async function typedVideoBlob(parts: BlobPart[], recordedType?: string | null) {
  const first = parts[0];
  let header: Uint8Array;
  if (first instanceof Blob) {
    header = new Uint8Array(await first.slice(0, 16).arrayBuffer());
  } else if (first instanceof ArrayBuffer) {
    header = new Uint8Array(first.slice(0, 16));
  } else if (ArrayBuffer.isView(first)) {
    header = new Uint8Array(first.buffer, first.byteOffset, Math.min(16, first.byteLength));
  } else {
    header = new Uint8Array(await new Blob(parts).slice(0, 16).arrayBuffer());
  }
  return new Blob(parts, { type: sniffVideoContentType(header, recordedType) });
}

export async function contentTypeForVideoBlob(blob: Blob, reported?: string | null) {
  const header = await blob.slice(0, 16).arrayBuffer();
  return sniffVideoContentType(header, reported || blob.type);
}

export function createVideoRecorder(stream: MediaStream, bitrate: number) {
  const withAudio = stream.getAudioTracks().length > 0;
  const attempts: MediaRecorderOptions[] = recorderMimeCandidates(withAudio).map((mimeType) => ({
    mimeType,
    videoBitsPerSecond: bitrate,
    ...(withAudio ? { audioBitsPerSecond: 128_000 } : {}),
  }));
  attempts.push({ videoBitsPerSecond: bitrate });
  attempts.push({});

  for (const options of attempts) {
    try {
      return new MediaRecorder(stream, options);
    } catch {
      // try the next container / codec
    }
  }
  return new MediaRecorder(stream);
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
