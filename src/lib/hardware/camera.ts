import { assertBoothRole } from "@/lib/deviceRole";
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

export type CameraFacing = "user" | "environment";

/** Front/back availability as far as the phone can tell (null = unknown, e.g. no labels yet). */
export interface CameraAvailability {
  front: boolean | null;
  back: boolean | null;
  count: number;
}

export interface CameraOpenResult {
  stream: MediaStream;
  requested: CameraFacing;
  /** Facing the browser actually gave us (null when it doesn't say, e.g. desktop webcams). */
  actual: CameraFacing | null;
  /** True when the requested camera could not be opened and another one was used. */
  fellBack: boolean;
}

const FACING_KEY = "360show.cameraFacing";

export function isCameraFacing(value: unknown): value is CameraFacing {
  return value === "user" || value === "environment";
}

/** Per-device choice (the booth phone), kept in localStorage. Default: back camera. */
export function readCameraFacing(): CameraFacing {
  if (typeof window === "undefined") return "environment";
  try {
    const v = localStorage.getItem(FACING_KEY);
    return isCameraFacing(v) ? v : "environment";
  } catch {
    return "environment";
  }
}

export function writeCameraFacing(facing: CameraFacing) {
  try {
    localStorage.setItem(FACING_KEY, facing);
  } catch {
    // private mode: the choice still applies for this page load
  }
}

function facingOf(stream: MediaStream): CameraFacing | null {
  const f = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
  return isCameraFacing(f) ? f : null;
}

export async function getCameraAvailability(): Promise<CameraAvailability> {
  assertBoothRole("getCameraAvailability");
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return { front: null, back: null, count: 0 };
  }
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    const labels = cams.map((d) => d.label.toLowerCase());
    const labelled = labels.some(Boolean);
    const front = labels.some((l) => /front|user|facing front|selfie/.test(l));
    const back = labels.some((l) => /back|rear|environment|world/.test(l));
    if (!labelled || (!front && !back)) {
      // Unlabelled or desktop webcams: we can't tell which way they face.
      return { front: cams.length ? null : false, back: cams.length ? null : false, count: cams.length };
    }
    return { front, back, count: cams.length };
  } catch {
    return { front: null, back: null, count: 0 };
  }
}

/**
 * Open the requested camera. Tries the exact facing first (so we know if it
 * exists), then the other facing, then any camera. Never mirrors the stream:
 * recordings are saved exactly as the sensor delivers them.
 */
export async function openCamera(quality: VideoQuality = "high", facing: CameraFacing = readCameraFacing()): Promise<CameraOpenResult> {
  assertBoothRole("openCamera");
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API unavailable");
  }

  const resolved = resolveVideoQuality(quality);
  const profile = videoQualityProfile(resolved);
  const other: CameraFacing = facing === "user" ? "environment" : "user";
  const sized = (f: ConstrainDOMString): MediaTrackConstraints => ({
    facingMode: f,
    width: { ideal: profile.width },
    height: { ideal: profile.height },
    frameRate: { ideal: profile.fps },
  });
  const attempts: { video: MediaTrackConstraints | true; target: CameraFacing | null }[] = [
    { video: sized({ exact: facing }), target: facing },
    ...(resolved === "high"
      ? [{ video: { facingMode: { exact: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, target: facing }]
      : []),
    { video: { facingMode: { exact: facing } }, target: facing },
    // Desktop webcams / browsers without facingMode support reject `exact`.
    { video: sized({ ideal: facing }), target: null },
    { video: { facingMode: { exact: other } }, target: other },
    { video: true, target: null },
  ];

  let lastError: unknown = null;
  for (const { video, target } of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      await applyQualityConstraints(stream, resolved);
      const actual = facingOf(stream) ?? target;
      return { stream, requested: facing, actual, fellBack: actual !== null && actual !== facing };
    } catch (error) {
      lastError = error;
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No camera available");
}

export async function getCameraStream(quality: VideoQuality = "high", facing?: CameraFacing): Promise<MediaStream> {
  assertBoothRole("getCameraStream");
  return (await openCamera(quality, facing)).stream;
}

export async function probeCamera(quality: VideoQuality = "high", facing?: CameraFacing): Promise<CameraStatus> {
  assertBoothRole("probeCamera");
  return (await probeCameraFacing(quality, facing)).status;
}

/** Briefly open the chosen camera to learn status, actual facing, and fallback. */
export async function probeCameraFacing(
  quality: VideoQuality = "high",
  facing: CameraFacing = readCameraFacing(),
): Promise<{ status: CameraStatus; actual: CameraFacing | null; fellBack: boolean; availability: CameraAvailability }> {
  assertBoothRole("probeCameraFacing");
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { status: "unavailable", actual: null, fellBack: false, availability: { front: false, back: false, count: 0 } };
  }
  try {
    const opened = await openCamera(quality, facing);
    opened.stream.getTracks().forEach((track) => track.stop());
    const availability = await getCameraAvailability();
    // What we just learned beats label guessing.
    if (opened.actual === facing) availability[facing === "user" ? "front" : "back"] = true;
    if (opened.fellBack) availability[facing === "user" ? "front" : "back"] = false;
    return { status: "ok", actual: opened.actual, fellBack: opened.fellBack, availability };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return {
      status: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable",
      actual: null,
      fellBack: false,
      availability: await getCameraAvailability(),
    };
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
