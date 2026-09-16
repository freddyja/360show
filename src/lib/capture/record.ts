import { DEMO_ASSET_PATH } from "../types";
import { getCameraStream, stopStream } from "../hardware/camera";
import { createDemoScene } from "./demoScene";
import { createVideoRecorder, resolveVideoQuality, videoQualityProfile, type VideoQuality } from "./quality";

export type RecordResult = {
  blob: Blob | null;
  source: "camera" | "demo";
  previewStream: MediaStream;
  stopPreview: () => void;
};

async function recordStream(
  stream: MediaStream,
  durationMs: number,
  quality: VideoQuality,
): Promise<Blob | null> {
  if (typeof MediaRecorder === "undefined") return null;
  const recorder = createVideoRecorder(stream, videoQualityProfile(quality).bitrate);
  const chunks: BlobPart[] = [];

  const blobPromise = new Promise<Blob | null>((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => resolve(null);
    recorder.onstop = () => {
      if (!chunks.length) {
        resolve(null);
        return;
      }
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    };
  });

  recorder.start(250);
  await wait(durationMs);
  if (recorder.state !== "inactive") recorder.stop();
  return blobPromise;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function blobFromDemoAsset() {
  try {
    const res = await fetch(DEMO_ASSET_PATH);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function beginLivePreview(
  preferCamera: boolean,
  quality: VideoQuality = "high",
): Promise<{
  stream: MediaStream;
  source: "camera" | "demo";
  stop: () => void;
}> {
  const resolved = resolveVideoQuality(quality);
  if (preferCamera) {
    try {
      const stream = await getCameraStream(resolved);
      return {
        stream,
        source: "camera",
        stop: () => stopStream(stream),
      };
    } catch {
      // fall through to demo
    }
  }

  const scene = createDemoScene();
  scene.start();
  const stream = scene.captureStream(30);
  return {
    stream,
    source: "demo",
    stop: () => {
      scene.stop();
      stopStream(stream);
    },
  };
}

export async function recordCapture(
  durationMs: number,
  live: { stream: MediaStream; source: "camera" | "demo" },
  quality: VideoQuality = "high",
): Promise<Omit<RecordResult, "previewStream" | "stopPreview">> {
  let blob = await recordStream(live.stream, durationMs, resolveVideoQuality(quality));
  if (!blob || blob.size < 1000) {
    blob = await blobFromDemoAsset();
  }
  return { blob, source: live.source };
}

export async function thumbnailFromVideo(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const fail = () => resolve(null);
    video.onerror = fail;
    video.onloadeddata = () => {
      const seekTo = Math.min(0.4, (video.duration || 1) * 0.2);
      const capture = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 360;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        } catch {
          resolve(null);
        }
      };
      if (video.seekable.length) {
        video.currentTime = seekTo;
        video.onseeked = capture;
      } else {
        capture();
      }
    };
  });
}
