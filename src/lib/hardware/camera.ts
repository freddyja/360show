import type { VideoQuality } from "../capture/quality";
import { resolveVideoQuality, videoQualityProfile } from "../capture/quality";

export type CameraStatus = "ok" | "denied" | "unavailable";

async function applyQualityConstraints(stream: MediaStream, quality: VideoQuality) {
  const track = stream.getVideoTracks()[0];
  if (!track?.applyConstraints) return;
  const profile = videoQualityProfile(quality);
  const caps = track.getCapabilities?.();
  const maxW = caps?.width && "max" in caps.width ? caps.width.max : undefined;
  const maxH = caps?.height && "max" in caps.height ? caps.height.max : undefined;
  // 1080p is the reliable target. If the sensor reports more, still cap at the profile
  // (Fold / flagship phones can do 4K, which blows up bake time and Blob size).
  const width = maxW ? Math.min(profile.width, maxW) : profile.width;
  const height = maxH ? Math.min(profile.height, maxH) : profile.height;
  try {
    await track.applyConstraints({
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: profile.fps },
    });
  } catch {
    // Keep whatever getUserMedia already granted.
  }
}

export async function getCameraStream(quality: VideoQuality = "high"): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API unavailable");
  }

  const resolved = resolveVideoQuality(quality);
  const profile = videoQualityProfile(resolved);
  const attempts: MediaTrackConstraints[] = [
    {
      facingMode: { ideal: "environment" },
      width: { ideal: profile.width },
      height: { ideal: profile.height },
      frameRate: { ideal: profile.fps },
    },
  ];
  if (resolved === "high") {
    attempts.push({
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    });
  }
  attempts.push({ facingMode: { ideal: "environment" } });

  for (const video of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      await applyQualityConstraints(stream, resolved);
      return stream;
    } catch {
      // try the next, looser constraint set
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  });
  await applyQualityConstraints(stream, resolved);
  return stream;
}

export async function probeCamera(quality: VideoQuality = "high"): Promise<CameraStatus> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unavailable";
  }
  try {
    const stream = await getCameraStream(quality);
    stream.getTracks().forEach((track) => track.stop());
    return "ok";
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    return "unavailable";
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
