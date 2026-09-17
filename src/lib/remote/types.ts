import {
  CAPTURE_DURATION_SECS,
  CLOUD_DESTINATIONS,
  VIDEO_QUALITIES,
  type CaptureDurationSec,
  type CloudDestination,
  type FrameStyleId,
  type VideoQuality,
} from "@/lib/types";
import { MUSIC_BEDS, type MusicBedLabel } from "@/lib/music/beds";

export const REMOTE_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export const REMOTE_BOOTH_ONLINE_MS = 8_000;
export const REMOTE_OPERATOR_ONLINE_MS = 12_000;
export const REMOTE_COMMAND_TTL_MS = 45_000;
export const REMOTE_POLL_MS = 1_500;

export const REMOTE_COMMAND_TYPES = [
  "startSpin",
  "setSpinLength",
  "setMusicBed",
  "setFrameStyle",
  "setEventBranding",
  "setSlowMo",
  "setVideoQuality",
  "setBoothMusicMuted",
  "setCloudDestination",
] as const;

export type RemoteCommandType = (typeof REMOTE_COMMAND_TYPES)[number];

export type RemoteBoothPhase = "idle" | "countdown" | "recording" | "processing";

export type RemoteConnection = "paired" | "waiting" | "offline";

export interface RemoteEventSnapshot {
  name: string;
  clientNames: string;
  accentColor: string;
  captureDurationSec: CaptureDurationSec;
  musicBedLabel: MusicBedLabel;
  hasCustomMusic: boolean;
  usingCustomMusic: boolean;
  customMusicName: string | null;
  frameStyle: FrameStyleId;
  preferBundledBed: boolean;
  slowMoEnabled: boolean;
  videoQuality: VideoQuality;
  boothMusicMuted: boolean;
  cloudDestination: CloudDestination;
  driveFolderName: string;
  driveConnected: boolean;
  driveConfigured: boolean;
  blobConfigured: boolean;
}

export interface RemoteCommandPayload {
  captureDurationSec?: CaptureDurationSec;
  musicBedLabel?: MusicBedLabel;
  frameStyle?: FrameStyleId;
  name?: string;
  clientNames?: string;
  accentColor?: string;
  slowMoEnabled?: boolean;
  videoQuality?: VideoQuality;
  boothMusicMuted?: boolean;
  cloudDestination?: CloudDestination;
  driveFolderName?: string;
}

export interface RemoteCommand {
  id: string;
  type: RemoteCommandType;
  createdAt: number;
  payload: RemoteCommandPayload;
}

export interface RemoteAck {
  commandId: string;
  ok: boolean;
  message: string;
  at: number;
}

export interface RemoteSession {
  eventId: string;
  pairCode: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  boothHeartbeatAt: number;
  boothArmed: boolean;
  boothPhase: RemoteBoothPhase;
  boothStatus: string;
  lastClipId: string | null;
  operatorHeartbeatAt: number;
  lastAck: RemoteAck | null;
  snapshot: RemoteEventSnapshot;
}

export interface RemotePublicView {
  eventId: string;
  connection: RemoteConnection;
  boothArmed: boolean;
  boothPhase: RemoteBoothPhase;
  boothStatus: string;
  boothHeartbeatAt: number;
  operatorHeartbeatAt: number;
  lastClipId: string | null;
  expiresAt: number;
  lastAck: RemoteAck | null;
  pendingCommand: { id: string; type: RemoteCommandType; createdAt: number } | null;
  snapshot: RemoteEventSnapshot;
  pairCode: string;
}

export function isEventId(value: string) {
  return /^[A-Za-z0-9._-]{6,96}$/.test(value);
}

export function isRemoteCommandType(value: unknown): value is RemoteCommandType {
  return typeof value === "string" && (REMOTE_COMMAND_TYPES as readonly string[]).includes(value);
}

export function isCaptureDurationSec(value: unknown): value is CaptureDurationSec {
  return value === 10 || value === 15 || value === 20;
}

export function isMusicBedLabel(value: unknown): value is MusicBedLabel {
  return typeof value === "string" && (MUSIC_BEDS as readonly string[]).includes(value);
}

export function isVideoQuality(value: unknown): value is VideoQuality {
  return value === "high" || value === "standard";
}

export function isCloudDestination(value: unknown): value is CloudDestination {
  return value === "blob" || value === "drive";
}

export function isAccentColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function clipText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const next = value.replace(/\s+/g, " ").trim().slice(0, max);
  return next;
}

export function remoteSessionPath(eventId: string) {
  return `remote/${eventId}/session.json`;
}

export function remoteCommandPath(eventId: string) {
  return `remote/${eventId}/command.json`;
}

export function remoteOperatorPath(eventId: string) {
  return `remote/${eventId}/operator.json`;
}

export function remotePairStorageKey(eventId: string) {
  return `360show.remote.${eventId}`;
}

export function connectionFromSession(
  session: Pick<RemoteSession, "expiresAt" | "boothHeartbeatAt" | "boothArmed">,
  now = Date.now(),
): RemoteConnection {
  if (now > session.expiresAt) return "offline";
  const boothFresh = now - session.boothHeartbeatAt < REMOTE_BOOTH_ONLINE_MS;
  if (session.boothArmed && boothFresh) return "paired";
  if (session.boothHeartbeatAt > 0 && !boothFresh) return "offline";
  return "waiting";
}

export function operatorIsFresh(session: Pick<RemoteSession, "operatorHeartbeatAt" | "expiresAt">, now = Date.now()) {
  if (now > session.expiresAt) return false;
  return session.operatorHeartbeatAt > 0 && now - session.operatorHeartbeatAt < REMOTE_OPERATOR_ONLINE_MS;
}

export function boothStatusForPhase(phase: RemoteBoothPhase, extra?: string | null) {
  if (phase === "countdown") return "Countdown…";
  if (phase === "recording") return "Recording…";
  if (phase === "processing") return "Saving spin…";
  if (extra?.trim()) return extra.trim();
  return "Idle";
}

export { CAPTURE_DURATION_SECS, CLOUD_DESTINATIONS, VIDEO_QUALITIES };
