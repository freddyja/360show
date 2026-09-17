export const FRAME_STYLE_IDS = [
  "gold-oval",
  "neon-ring",
  "midnight-arch",
  "classic-plaque",
  "minimal",
  "christian-fellowship",
  "polaroid-stack",
  "disco-chrome",
  "black-tie-bar",
] as const;

export type FrameStyleId = (typeof FRAME_STYLE_IDS)[number];

export type RampProfileId = "time-ramp-v1" | "time-ramp-gentle";

export type CaptureSource = "camera" | "demo";

export const CAPTURE_DURATION_SECS = [10, 15, 20] as const;
export type CaptureDurationSec = (typeof CAPTURE_DURATION_SECS)[number];
export const DEFAULT_CAPTURE_DURATION_SEC: CaptureDurationSec = 10;

export function resolveCaptureDurationSec(value: unknown): CaptureDurationSec {
  return value === 15 || value === 20 ? value : DEFAULT_CAPTURE_DURATION_SEC;
}

export function captureDurationMs(value: unknown): number {
  return resolveCaptureDurationSec(value) * 1000;
}

export interface BoothEvent {
  id: string;
  name: string;
  date: string;
  clientNames: string;
  accentColor: string;
  logoDataUrl: string | null;
  musicBedLabel: string;
  /** IndexedDB blobs key for an operator-picked song. Wins over musicBedLabel when set. */
  customMusicBlobId?: string | null;
  /** Display name of the operator-picked song. */
  customMusicName?: string | null;
  /** START SPIN record length. Missing → 10s. */
  captureDurationSec?: CaptureDurationSec;
  frameStyle: FrameStyleId;
  createdAt: number;
  updatedAt: number;
  isSample?: boolean;
}

export interface Clip {
  id: string;
  eventId: string;
  createdAt: number;
  durationMs: number;
  source: CaptureSource;
  hasBlob: boolean;
  /** When no blob was recorded, play this bundled asset instead. */
  demoAssetPath: string | null;
  thumbnailDataUrl: string | null;
  rampProfile: RampProfileId;
  remoteVideoUrl?: string | null;
  cloudShareAt?: number | null;
  hasBakedBlob?: boolean;
  bakedAt?: number | null;
  /** True when the cached export includes a mixed music-bed audio track. */
  hasMixedAudio?: boolean;
}

export type CloudDestination = "blob" | "drive";

export const CLOUD_DESTINATIONS = ["blob", "drive"] as const;

export type VideoQuality = "standard" | "high";

export const VIDEO_QUALITIES = ["standard", "high"] as const;

export interface AppSettings {
  deviceName: string;
  mockBatteryPct: number;
  forceOffline: boolean;
  cloudDestination: CloudDestination;
  driveFolderName: string;
  /** Live preview ramp + baked slow-mo exports. Default on. */
  slowMoEnabled: boolean;
  /** Capture + bake resolution / bitrate. Default high (1080p). */
  videoQuality: VideoQuality;
  /** Mute looping booth beds on the operator tablet. Guests still hear overlay / mixed files. */
  boothMusicMuted: boolean;
}

export interface KvState {
  seeded: boolean;
  activeEventId: string | null;
}

export { MUSIC_BEDS, type MusicBedLabel } from "./music/beds";

export const DEFAULT_SETTINGS: AppSettings = {
  deviceName: "Booth Tablet 1",
  mockBatteryPct: 87,
  forceOffline: false,
  cloudDestination: "blob",
  driveFolderName: "360show",
  slowMoEnabled: true,
  videoQuality: "high",
  boothMusicMuted: false,
};

export const CAPTURE_DURATION_MS = DEFAULT_CAPTURE_DURATION_SEC * 1000;
export const COUNTDOWN_SECONDS = 3;
export const DEMO_ASSET_PATH = "/demo/spin.mp4";
