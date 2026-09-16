export const FRAME_STYLE_IDS = [
  "gold-oval",
  "neon-ring",
  "midnight-arch",
  "classic-plaque",
  "minimal",
  "christian-fellowship",
] as const;

export type FrameStyleId = (typeof FRAME_STYLE_IDS)[number];

export type RampProfileId = "time-ramp-v1" | "time-ramp-gentle";

export type CaptureSource = "camera" | "demo";

export interface BoothEvent {
  id: string;
  name: string;
  date: string;
  clientNames: string;
  accentColor: string;
  logoDataUrl: string | null;
  musicBedLabel: string;
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
}

export type CloudDestination = "blob" | "drive";

export const CLOUD_DESTINATIONS = ["blob", "drive"] as const;

export interface AppSettings {
  deviceName: string;
  mockBatteryPct: number;
  forceOffline: boolean;
  cloudDestination: CloudDestination;
  driveFolderName: string;
  /** Live preview ramp + baked slow-mo exports. Default on. */
  slowMoEnabled: boolean;
}

export interface KvState {
  seeded: boolean;
  activeEventId: string | null;
}

export const MUSIC_BEDS = [
  "None",
  "Cinematic swell",
  "Can't Help Falling in Love (instrumental)",
  "First Dance piano",
  "Upbeat house bed",
  "Silent disco pulse",
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  deviceName: "Booth Tablet 1",
  mockBatteryPct: 87,
  forceOffline: false,
  cloudDestination: "blob",
  driveFolderName: "360show",
  slowMoEnabled: true,
};

export const CAPTURE_DURATION_MS = 10_000;
export const COUNTDOWN_SECONDS = 3;
export const DEMO_ASSET_PATH = "/demo/spin.mp4";
