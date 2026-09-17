import { normalizeMusicBedLabel, type MusicBedLabel } from "@/lib/music/beds";
import type { AppSettings, CaptureDurationSec, CloudDestination, FrameStyleId, VideoQuality } from "@/lib/types";
import type {
  RemoteBoothPhase,
  RemoteCommandPayload,
  RemoteCommandType,
  RemoteEventSnapshot,
  RemotePublicView,
} from "./types";
import { REMOTE_POLL_MS, remotePairStorageKey } from "./types";

export { REMOTE_POLL_MS, remotePairStorageKey };

export interface StoredRemotePair {
  token: string;
  pairCode: string;
  remoteUrl: string;
}

export interface RemoteCloudFlags {
  blobConfigured: boolean;
  driveConfigured: boolean;
  driveConnected: boolean;
}

export function readStoredPair(eventId: string): StoredRemotePair | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(remotePairStorageKey(eventId));
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredRemotePair;
    if (!data?.token) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeStoredPair(eventId: string, pair: StoredRemotePair) {
  sessionStorage.setItem(remotePairStorageKey(eventId), JSON.stringify(pair));
}

export function clearStoredPair(eventId: string) {
  sessionStorage.removeItem(remotePairStorageKey(eventId));
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Remote request failed (${res.status})`);
  }
  return data;
}

export async function pairRemote(eventId: string, snapshot: RemoteEventSnapshot) {
  const res = await fetch("/api/remote/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId, snapshot }),
  });
  const data = await parseJson<{
    token: string;
    pairCode: string;
    remoteUrl: string;
    expiresAt: number;
    view: RemotePublicView;
  }>(res);
  writeStoredPair(eventId, {
    token: data.token,
    pairCode: data.pairCode,
    remoteUrl: data.remoteUrl,
  });
  return data;
}

export async function disableRemote(eventId: string, token: string) {
  const res = await fetch("/api/remote/disable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId, token }),
    keepalive: true,
  });
  clearStoredPair(eventId);
  return parseJson<{ ok: boolean }>(res);
}

export async function joinRemote(eventId: string, pairCode: string) {
  const res = await fetch("/api/remote/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId, pairCode }),
  });
  const data = await parseJson<{ token: string; pairCode: string; view: RemotePublicView }>(res);
  writeStoredPair(eventId, {
    token: data.token,
    pairCode: data.pairCode,
    remoteUrl: `${window.location.origin}/e/${eventId}/remote?k=${encodeURIComponent(data.token)}`,
  });
  return data;
}

export async function heartbeatRemote(input: {
  eventId: string;
  token: string;
  boothArmed: boolean;
  boothPhase: RemoteBoothPhase;
  boothStatus: string;
  lastClipId?: string | null;
  snapshot: RemoteEventSnapshot;
  ack?: { commandId: string; ok: boolean; message: string } | null;
  acks?: { commandId: string; ok: boolean; message: string }[] | null;
}) {
  const res = await fetch("/api/remote/heartbeat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  });
  return parseJson<{
    ok: boolean;
    view: RemotePublicView;
    pendingCommand: {
      id: string;
      type: RemoteCommandType;
      createdAt: number;
      payload: RemoteCommandPayload;
    } | null;
    pendingCommands?: {
      id: string;
      type: RemoteCommandType;
      createdAt: number;
      payload: RemoteCommandPayload;
    }[];
  }>(res);
}

export async function remoteStatus(eventId: string, token: string) {
  const res = await fetch(
    `/api/remote/status?eventId=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  return parseJson<{ view: RemotePublicView }>(res);
}

export async function sendRemoteCommand(
  eventId: string,
  token: string,
  type: RemoteCommandType,
  payload: RemoteCommandPayload = {},
) {
  const res = await fetch("/api/remote/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId, token, type, payload }),
  });
  return parseJson<{ ok: boolean; commandId: string; view: RemotePublicView }>(res);
}

export function snapshotFromBooth(
  event: {
    name: string;
    clientNames: string;
    accentColor: string;
    captureDurationSec?: number;
    musicBedLabel: string;
    customMusicBlobId?: string | null;
    customMusicName?: string | null;
    preferBundledBed?: boolean;
    frameStyle: string;
  },
  settings: Pick<AppSettings, "slowMoEnabled" | "videoQuality" | "boothMusicMuted" | "cloudDestination" | "driveFolderName">,
  cloud: RemoteCloudFlags = { blobConfigured: false, driveConfigured: false, driveConnected: false },
): RemoteEventSnapshot {
  const hasCustom = Boolean(event.customMusicBlobId);
  const prefer = Boolean(event.preferBundledBed);
  return {
    name: event.name,
    clientNames: event.clientNames,
    accentColor: event.accentColor,
    captureDurationSec: event.captureDurationSec === 15 || event.captureDurationSec === 20 ? event.captureDurationSec : 10,
    musicBedLabel: normalizeMusicBedLabel(event.musicBedLabel),
    hasCustomMusic: hasCustom,
    usingCustomMusic: hasCustom && !prefer,
    customMusicName: event.customMusicName ?? null,
    frameStyle: event.frameStyle as FrameStyleId,
    preferBundledBed: prefer,
    slowMoEnabled: settings.slowMoEnabled !== false,
    videoQuality: settings.videoQuality === "standard" ? "standard" : "high",
    boothMusicMuted: settings.boothMusicMuted === true,
    cloudDestination: settings.cloudDestination === "drive" ? "drive" : "blob",
    driveFolderName: settings.driveFolderName || "360show",
    driveConnected: cloud.driveConnected,
    driveConfigured: cloud.driveConfigured,
    blobConfigured: cloud.blobConfigured,
  };
}

export type { CaptureDurationSec, CloudDestination, FrameStyleId, MusicBedLabel, VideoQuality };
