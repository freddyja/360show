import { timingSafeEqual } from "crypto";
import { del } from "@vercel/blob";
import { getWithStoreAccess, putWithStoreAccess } from "@/lib/share/blobAccess";
import { blobConfigured } from "@/lib/share/server";
import { blobUsable, noteBlobFailure } from "@/lib/share/blobStatus";
import { createId } from "@/lib/ids";
import {
  cacheCommandKey,
  cacheDeleteKey,
  cacheGetJson,
  cacheOperatorKey,
  cacheSessionKey,
  cacheSetJson,
  runtimeCacheReady,
} from "./cacheBackend";
import {
  REMOTE_COMMAND_TTL_MS,
  REMOTE_SESSION_TTL_MS,
  connectionFromSession,
  isEventId,
  remoteCommandPath,
  remoteMusicMetaPath,
  remoteMusicPath,
  remoteOperatorPath,
  remoteSessionPath,
  type RemoteAck,
  type RemoteCommand,
  type RemoteEventSnapshot,
  type RemotePublicView,
  type RemoteSession,
} from "./types";

const PAIR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type RemoteMusicFile = {
  bytes: Buffer;
  fileName: string;
  contentType: string;
};

type MemoryBucket = {
  session: RemoteSession | null;
  commands: RemoteCommand[];
  operatorAt: number;
  music: RemoteMusicFile | null;
};

const memory = globalThis as unknown as { __360showRemote?: Map<string, MemoryBucket> };

function memoryMap() {
  if (!memory.__360showRemote) memory.__360showRemote = new Map();
  return memory.__360showRemote;
}

export type RemoteStoreMode = "blob" | "cache" | "memory" | "none";

const MODE_TTL_MS = 30_000;
const gMode = globalThis as unknown as { __360showRemoteMode?: { at: number; mode: RemoteStoreMode } };

export async function resolveRemoteStoreMode(): Promise<RemoteStoreMode> {
  const cached = gMode.__360showRemoteMode;
  if (cached && Date.now() - cached.at < MODE_TTL_MS) return cached.mode;
  let mode: RemoteStoreMode = "none";
  if (await runtimeCacheReady()) mode = "cache";
  else if (await blobUsable()) mode = "blob";
  else if (process.env.NODE_ENV !== "production") mode = "memory";
  gMode.__360showRemoteMode = { at: Date.now(), mode };
  return mode;
}

export async function remoteStoreReady() {
  return (await resolveRemoteStoreMode()) !== "none";
}

/** @deprecated Use resolveRemoteStoreMode(); kept as an alias. */
export async function remoteStoreMode() {
  return resolveRemoteStoreMode();
}

export async function remoteMusicAvailable() {
  const mode = await resolveRemoteStoreMode();
  if (mode === "none") return false;
  if (mode === "memory") return true;
  return blobUsable();
}

export function storeUnavailableMessage() {
  return "Laptop remote is paused while no pairing channel is available. Use the booth phone for capture, look, and songs.";
}

export function musicUnavailableMessage() {
  return "Laptop song upload needs a working Vercel Blob store. Pick a song on the booth phone in Event setup.";
}

function randomPairCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => PAIR_ALPHABET[b % PAIR_ALPHABET.length]).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString("base64url");
}

export function normalizePairCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function readJsonBlob<T>(pathname: string): Promise<T | null> {
  if (!blobConfigured()) return null;
  try {
    const result = await getWithStoreAccess(pathname);
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return (await new Response(result.stream).json()) as T;
  } catch (error) {
    noteBlobFailure(error);
    return null;
  }
}

async function writeJsonBlob(pathname: string, data: unknown) {
  try {
    await putWithStoreAccess(pathname, JSON.stringify(data), { contentType: "application/json" });
  } catch (error) {
    noteBlobFailure(error);
    throw error;
  }
}

async function deleteJsonBlob(pathname: string) {
  try {
    await del(pathname);
  } catch {
    try {
      await writeJsonBlob(pathname, { empty: true, clearedAt: Date.now() });
    } catch {
      // Best-effort clear.
    }
  }
}

function liveSession(data: RemoteSession | null | undefined, eventId: string): RemoteSession | null {
  if (!data?.eventId || data.eventId !== eventId || !data.token) return null;
  return data;
}

export async function readSession(eventId: string): Promise<RemoteSession | null> {
  if (!isEventId(eventId)) return null;
  const mode = await resolveRemoteStoreMode();
  if (mode === "blob") {
    return liveSession(await readJsonBlob<RemoteSession>(remoteSessionPath(eventId)), eventId);
  }
  if (mode === "cache") {
    return liveSession(await cacheGetJson<RemoteSession>(cacheSessionKey(eventId)), eventId);
  }
  if (mode === "memory") return memoryMap().get(eventId)?.session ?? null;
  return null;
}

export async function writeSession(session: RemoteSession) {
  const mode = await resolveRemoteStoreMode();
  if (mode === "blob") {
    await writeJsonBlob(remoteSessionPath(session.eventId), session);
    return;
  }
  if (mode === "cache") {
    await cacheSetJson(cacheSessionKey(session.eventId), session);
    return;
  }
  const bucket = memoryMap().get(session.eventId) ?? { session: null, commands: [], operatorAt: 0, music: null };
  bucket.session = session;
  memoryMap().set(session.eventId, bucket);
}

type CommandFile = { commands: RemoteCommand[] } | RemoteCommand | { empty?: boolean };

function commandsFromFile(data: CommandFile | null | undefined, now = Date.now()): RemoteCommand[] {
  if (!data || typeof data !== "object") return [];
  if ("empty" in data && data.empty) return [];
  const list = "commands" in data && Array.isArray(data.commands) ? data.commands : "id" in data && data.id ? [data as RemoteCommand] : [];
  return list.filter((cmd) => cmd?.id && cmd.type && now - cmd.createdAt <= REMOTE_COMMAND_TTL_MS);
}

export async function readCommands(eventId: string): Promise<RemoteCommand[]> {
  if (!isEventId(eventId)) return [];
  const mode = await resolveRemoteStoreMode();
  if (mode === "blob") {
    return commandsFromFile(await readJsonBlob<CommandFile>(remoteCommandPath(eventId)));
  }
  if (mode === "cache") {
    return commandsFromFile(await cacheGetJson<CommandFile>(cacheCommandKey(eventId)));
  }
  if (mode === "memory") return commandsFromFile({ commands: memoryMap().get(eventId)?.commands ?? [] });
  return [];
}

export async function readCommand(eventId: string): Promise<RemoteCommand | null> {
  const list = await readCommands(eventId);
  return list[0] ?? null;
}

async function persistCommands(eventId: string, commands: RemoteCommand[]) {
  const mode = await resolveRemoteStoreMode();
  if (mode === "blob") {
    if (!commands.length) {
      await deleteJsonBlob(remoteCommandPath(eventId));
      return;
    }
    await writeJsonBlob(remoteCommandPath(eventId), { commands });
    return;
  }
  if (mode === "cache") {
    if (!commands.length) {
      await cacheDeleteKey(cacheCommandKey(eventId));
      return;
    }
    await cacheSetJson(cacheCommandKey(eventId), { commands });
    return;
  }
  const bucket = memoryMap().get(eventId) ?? { session: null, commands: [], operatorAt: 0, music: null };
  bucket.commands = commands;
  memoryMap().set(eventId, bucket);
}

export async function writeCommand(eventId: string, command: RemoteCommand | null) {
  await persistCommands(eventId, command ? [command] : []);
}

export async function enqueueCommand(eventId: string, command: RemoteCommand) {
  const existing = await readCommands(eventId);
  if (existing.some((cmd) => cmd.type === "startSpin") && command.type === "startSpin") {
    throw new Error("START_SPIN_PENDING");
  }
  await persistCommands(eventId, [...existing, command].slice(-24));
}

export async function removeCommands(eventId: string, ids: string[]) {
  if (!ids.length) return;
  const idSet = new Set(ids);
  const existing = await readCommands(eventId);
  await persistCommands(
    eventId,
    existing.filter((cmd) => !idSet.has(cmd.id)),
  );
}

export async function touchOperatorPing(eventId: string, now = Date.now()) {
  if (!isEventId(eventId)) return now;
  const mode = await resolveRemoteStoreMode();
  if (mode === "blob") {
    await writeJsonBlob(remoteOperatorPath(eventId), { at: now });
    return now;
  }
  if (mode === "cache") {
    await cacheSetJson(cacheOperatorKey(eventId), { at: now });
    return now;
  }
  const bucket = memoryMap().get(eventId) ?? { session: null, commands: [], operatorAt: 0, music: null };
  bucket.operatorAt = now;
  memoryMap().set(eventId, bucket);
  return now;
}

export async function readOperatorPing(eventId: string): Promise<number> {
  if (!isEventId(eventId)) return 0;
  const mode = await resolveRemoteStoreMode();
  if (mode === "blob") {
    const data = await readJsonBlob<{ at?: number }>(remoteOperatorPath(eventId));
    return typeof data?.at === "number" ? data.at : 0;
  }
  if (mode === "cache") {
    const data = await cacheGetJson<{ at?: number }>(cacheOperatorKey(eventId));
    return typeof data?.at === "number" ? data.at : 0;
  }
  return memoryMap().get(eventId)?.operatorAt ?? 0;
}

export async function writeRemoteMusicMeta(
  eventId: string,
  meta: { fileName: string; contentType: string; size?: number },
) {
  if (blobConfigured()) {
    await writeJsonBlob(remoteMusicMetaPath(eventId), { ...meta, uploadedAt: Date.now() });
    return;
  }
  if ((await resolveRemoteStoreMode()) === "memory") {
    const bucket = memoryMap().get(eventId) ?? { session: null, commands: [], operatorAt: 0, music: null };
    if (bucket.music) {
      bucket.music = { ...bucket.music, fileName: meta.fileName, contentType: meta.contentType };
    }
    memoryMap().set(eventId, bucket);
  }
}

export async function writeRemoteMusic(
  eventId: string,
  bytes: Buffer,
  meta: { fileName: string; contentType: string },
) {
  if (blobConfigured()) {
    await putWithStoreAccess(remoteMusicPath(eventId, meta.fileName), bytes, {
      contentType: meta.contentType || "application/octet-stream",
    });
    await writeRemoteMusicMeta(eventId, { ...meta, size: bytes.length });
    return;
  }
  if ((await resolveRemoteStoreMode()) === "memory") {
    const bucket = memoryMap().get(eventId) ?? { session: null, commands: [], operatorAt: 0, music: null };
    bucket.music = { bytes, fileName: meta.fileName, contentType: meta.contentType };
    memoryMap().set(eventId, bucket);
    return;
  }
  throw new Error(musicUnavailableMessage());
}

export async function readRemoteMusic(eventId: string): Promise<RemoteMusicFile | null> {
  if (!isEventId(eventId)) return null;
  if (!blobConfigured()) {
    return memoryMap().get(eventId)?.music ?? null;
  }

  const meta = await readJsonBlob<{ fileName?: string; contentType?: string }>(remoteMusicMetaPath(eventId));
  const paths = [
    meta?.fileName ? remoteMusicPath(eventId, meta.fileName) : null,
    "mp3",
    "m4a",
    "aac",
    "wav",
    "ogg",
    "flac",
    "opus",
    "bin",
  ]
    .map((item) => (item && item.includes("/") ? item : item ? remoteMusicPath(eventId, item) : null))
    .filter((path, index, list): path is string => Boolean(path) && list.indexOf(path) === index);

  try {
    for (const pathname of paths) {
      const result = await getWithStoreAccess(pathname);
      if (!result || result.statusCode !== 200 || !result.stream) continue;
      const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
      if (!bytes.length) continue;
      return {
        bytes,
        fileName: meta?.fileName || pathname.split("/").pop() || "song",
        contentType: meta?.contentType || result.blob.contentType || "application/octet-stream",
      };
    }
    return memoryMap().get(eventId)?.music ?? null;
  } catch (error) {
    noteBlobFailure(error);
    return memoryMap().get(eventId)?.music ?? null;
  }
}

export async function createPairSession(eventId: string, snapshot: RemoteEventSnapshot): Promise<RemoteSession> {
  const now = Date.now();
  const session: RemoteSession = {
    eventId,
    pairCode: randomPairCode(),
    token: randomToken(),
    createdAt: now,
    expiresAt: now + REMOTE_SESSION_TTL_MS,
    boothHeartbeatAt: now,
    boothArmed: true,
    boothPhase: "idle",
    boothStatus: "Idle",
    lastClipId: null,
    operatorHeartbeatAt: 0,
    lastAck: null,
    snapshot,
  };
  await writeSession(session);
  await writeCommand(eventId, null);
  return session;
}

export async function expireSession(eventId: string) {
  const session = await readSession(eventId);
  if (!session) return;
  await writeSession({
    ...session,
    boothArmed: false,
    boothHeartbeatAt: 0,
    expiresAt: Date.now() - 1,
    boothStatus: "Remote disabled",
  });
  await writeCommand(eventId, null);
}

export function sessionIsLive(session: RemoteSession, now = Date.now()) {
  return now <= session.expiresAt;
}

export function tokenMatches(session: RemoteSession, token: string | null | undefined) {
  if (!token) return false;
  return safeEqual(session.token, token);
}

export function pairCodeMatches(session: RemoteSession, code: string | null | undefined) {
  if (!code) return false;
  const a = normalizePairCode(session.pairCode);
  const b = normalizePairCode(code);
  if (a.length !== 6 || b.length !== 6) return false;
  return safeEqual(a, b);
}

export function publicView(
  session: RemoteSession,
  pending: RemoteCommand | null,
  now = Date.now(),
  operatorHeartbeatAt = session.operatorHeartbeatAt,
): RemotePublicView {
  return {
    eventId: session.eventId,
    connection: connectionFromSession(session, now),
    boothArmed: session.boothArmed,
    boothPhase: session.boothPhase,
    boothStatus: session.boothStatus,
    boothHeartbeatAt: session.boothHeartbeatAt,
    operatorHeartbeatAt,
    lastClipId: session.lastClipId,
    expiresAt: session.expiresAt,
    lastAck: session.lastAck,
    pendingCommand: pending
      ? { id: pending.id, type: pending.type, createdAt: pending.createdAt }
      : null,
    snapshot: session.snapshot,
    pairCode: session.pairCode,
  };
}

export async function publicViewNow(session: RemoteSession, pending: RemoteCommand | null, now = Date.now()) {
  const operatorHeartbeatAt = Math.max(session.operatorHeartbeatAt, await readOperatorPing(session.eventId));
  return publicView(session, pending, now, operatorHeartbeatAt);
}

export function newCommandId() {
  return createId("rcmd");
}

export function applyAck(session: RemoteSession, ack: RemoteAck): RemoteSession {
  return { ...session, lastAck: ack };
}
