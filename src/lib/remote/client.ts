"use client";

import { upload } from "@vercel/blob/client";
import { formatBlobWriteError, isBlobAccessMismatch, isBlobUnusableError, type BlobAccess } from "@/lib/share/access";
import { validateCustomMusicFile } from "@/lib/music/custom";
import { materializeCustomMusicFile } from "@/lib/music/ingest";
import { normalizeMusicBedLabel, type MusicBedLabel } from "@/lib/music/beds";
import type { AppSettings, CaptureDurationSec, CloudDestination, FrameStyleId, VideoQuality } from "@/lib/types";
import type {
  RemoteBoothPhase,
  RemoteCommandPayload,
  RemoteCommandType,
  RemoteEventSnapshot,
  RemotePublicView,
} from "./types";
import { REMOTE_POLL_MS, remoteMusicPath, remotePairStorageKey } from "./types";

export { REMOTE_POLL_MS, remotePairStorageKey };

export interface StoredRemotePair {
  token: string;
  pairCode: string;
  remoteUrl: string;
}

export interface RemoteCloudFlags {
  blobConfigured: boolean;
  remoteMusicAvailable: boolean;
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

function abortSending() {
  const err = new Error("Stopped sending the song to the booth.");
  err.name = "AbortError";
  return err;
}

async function postRemoteMusicFile(eventId: string, token: string, file: File, signal?: AbortSignal) {
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("token", token);
  form.set("file", file);
  const res = await fetch("/api/remote/music", { method: "POST", body: form, signal });
  return parseJson<{ ok: boolean }>(res);
}

async function uploadRemoteMusicViaBlobClient(
  eventId: string,
  token: string,
  file: File,
  signal?: AbortSignal,
) {
  const pathname = remoteMusicPath(eventId, file.name);
  const order: BlobAccess[] = ["public", "private"];
  let lastError: unknown;
  for (const access of order) {
    try {
      await upload(pathname, file, {
        access,
        handleUploadUrl: "/api/remote/music/upload",
        clientPayload: JSON.stringify({ eventId, token }),
        multipart: false,
        abortSignal: signal,
      });
      return;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw abortSending();
      if (isBlobUnusableError(error)) {
        throw new Error(
          "Laptop song upload needs Vercel Blob, which is temporarily unavailable. Pick a song on the booth phone in Event setup.",
        );
      }
      if (!isBlobAccessMismatch(error)) {
        throw new Error(
          formatBlobWriteError(error) || (error instanceof Error ? error.message : "Upload failed"),
        );
      }
    }
  }
  throw new Error(formatBlobWriteError(lastError) || "Could not upload the song.");
}

export async function uploadRemoteMusic(
  eventId: string,
  token: string,
  file: File,
  blobConfigured: boolean,
  options?: { signal?: AbortSignal },
) {
  const invalid = validateCustomMusicFile(file);
  if (invalid) throw new Error(invalid);

  const local = await materializeCustomMusicFile(file, { signal: options?.signal });
  if (options?.signal?.aborted) throw abortSending();

  // Always POST through /api/remote/music so the booth GET can read the same object.
  // Client Blob uploads with onUploadCompleted can hang forever waiting for a webhook.
  try {
    await postRemoteMusicFile(eventId, token, local, options?.signal);
  } catch (error) {
    if (options?.signal?.aborted) throw abortSending();
    const message = error instanceof Error ? error.message : "";
    const tooLarge = /413|too large|payload/i.test(message);
    if (!blobConfigured || !tooLarge) throw error;
    await uploadRemoteMusicViaBlobClient(eventId, token, local, options?.signal);
  }

  return sendRemoteCommand(eventId, token, "setCustomMusic", {
    fileName: local.name,
    contentType: local.type || "application/octet-stream",
    size: local.size,
  });
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortSending());
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(abortSending());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Poll until Capture acks this command, or time out so the laptop spinner cannot stick. */
export async function waitForRemoteMusicAck(
  eventId: string,
  token: string,
  commandId: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
) {
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    if (options?.signal?.aborted) throw abortSending();
    try {
      const data = await remoteStatus(eventId, token);
      const ack = data.view.lastAck;
      if (ack?.commandId === commandId) {
        if (!ack.ok) throw new Error(ack.message || "The booth could not load that song.");
        return { ack, view: data.view };
      }
      lastError = null;
    } catch (error) {
      if (options?.signal?.aborted) throw abortSending();
      if (error instanceof Error && error.message.includes("booth could not load")) throw error;
      lastError = error;
    }
    await sleep(REMOTE_POLL_MS, options?.signal);
  }
  const err = new Error(
    lastError instanceof Error
      ? lastError.message
      : "The booth did not confirm the song. Keep Capture open on the phone and try again.",
  );
  err.name = "TimeoutError";
  throw err;
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
  cloud: RemoteCloudFlags = { blobConfigured: false, remoteMusicAvailable: false, driveConfigured: false, driveConnected: false },
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
    remoteMusicAvailable: Boolean(cloud.remoteMusicAvailable),
  };
}

export type { CaptureDurationSec, CloudDestination, FrameStyleId, MusicBedLabel, VideoQuality };
