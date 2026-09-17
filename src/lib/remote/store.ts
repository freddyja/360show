import { timingSafeEqual } from "crypto";
import { del, get, list } from "@vercel/blob";
import { blobConfigured } from "@/lib/share/server";
import { putWithStoreAccess, resolveBlobAccess } from "@/lib/share/blobAccess";
import { createId } from "@/lib/ids";
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

export function remoteStoreReady() {
  return blobConfigured() || process.env.NODE_ENV !== "production";
}

export function remoteStoreMode(): "blob" | "memory" | "none" {
  if (blobConfigured()) return "blob";
  if (process.env.NODE_ENV !== "production") return "memory";
  return "none";
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
    const prefix = pathname.slice(0, pathname.lastIndexOf("/") + 1);
    const { blobs } = await list({ prefix, limit: 12 });
    const match = blobs.find((item) => item.pathname === pathname || item.pathname.endsWith(pathname.split("/").pop() || ""));
    if (match?.url && !match.url.includes(".private.")) {
      const res = await fetch(match.url, { cache: "no-store" });
      if (res.ok) return (await res.json()) as T;
    }
    const listedPath = match?.pathname || pathname;
    const access = match?.url?.includes(".private.") ? "private" : await resolveBlobAccess();
    const result = await get(listedPath, { access });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return (await new Response(result.stream).json()) as T;
  } catch {
    try {
      const access = await resolveBlobAccess();
      const result = await get(pathname, { access });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return (await new Response(result.stream).json()) as T;
    } catch {
      return null;
    }
  }
}

async function writeJsonBlob(pathname: string, data: unknown) {
  await putWithStoreAccess(pathname, JSON.stringify(data), { contentType: "application/json" });
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

export async function readSession(eventId: string): Promise<RemoteSession | null> {
  if (!isEventId(eventId)) return null;
  if (blobConfigured()) {
    const data = await readJsonBlob<RemoteSession>(remoteSessionPath(eventId));
    if (!data?.eventId || data.eventId !== eventId || !data.token) return null;
    return data;
  }
  return memoryMap().get(eventId)?.session ?? null;
}

export async function writeSession(session: RemoteSession) {
  if (blobConfigured()) {
    await writeJsonBlob(remoteSessionPath(session.eventId), session);
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
  if (blobConfigured()) {
    const data = await readJsonBlob<CommandFile>(remoteCommandPath(eventId));
    return commandsFromFile(data);
  }
  return commandsFromFile({ commands: memoryMap().get(eventId)?.commands ?? [] });
}

export async function readCommand(eventId: string): Promise<RemoteCommand | null> {
  const list = await readCommands(eventId);
  return list[0] ?? null;
}

async function persistCommands(eventId: string, commands: RemoteCommand[]) {
  if (blobConfigured()) {
    if (!commands.length) {
      await deleteJsonBlob(remoteCommandPath(eventId));
      return;
    }
    await writeJsonBlob(remoteCommandPath(eventId), { commands });
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
  if (blobConfigured()) {
    await writeJsonBlob(remoteOperatorPath(eventId), { at: now });
    return now;
  }
  const bucket = memoryMap().get(eventId) ?? { session: null, commands: [], operatorAt: 0, music: null };
  bucket.operatorAt = now;
  memoryMap().set(eventId, bucket);
  return now;
}

export async function readOperatorPing(eventId: string): Promise<number> {
  if (!isEventId(eventId)) return 0;
  if (blobConfigured()) {
    const data = await readJsonBlob<{ at?: number }>(remoteOperatorPath(eventId));
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
  const bucket = memoryMap().get(eventId) ?? { session: null, commands: [], operatorAt: 0, music: null };
  if (bucket.music) {
    bucket.music = { ...bucket.music, fileName: meta.fileName, contentType: meta.contentType };
  }
  memoryMap().set(eventId, bucket);
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
  const bucket = memoryMap().get(eventId) ?? { session: null, commands: [], operatorAt: 0, music: null };
  bucket.music = { bytes, fileName: meta.fileName, contentType: meta.contentType };
  memoryMap().set(eventId, bucket);
}

async function streamToBuffer(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return null;
  const buf = Buffer.from(await new Response(stream).arrayBuffer());
  return buf.length ? buf : null;
}

export async function readRemoteMusic(eventId: string): Promise<RemoteMusicFile | null> {
  if (!isEventId(eventId)) return null;
  if (!blobConfigured()) {
    return memoryMap().get(eventId)?.music ?? null;
  }

  const meta = await readJsonBlob<{ fileName?: string; contentType?: string }>(remoteMusicMetaPath(eventId));
  try {
    const { blobs } = await list({ prefix: `remote/${eventId}/music`, limit: 12 });
    const file = blobs.find((item) => /\/music\.(mp3|m4a|aac|wav|ogg|flac|opus|bin)$/i.test(item.pathname));
    if (!file) return null;
    const access = file.url.includes(".private.") ? "private" : await resolveBlobAccess();
    if (!file.url.includes(".private.")) {
      const res = await fetch(file.url, { cache: "no-store" });
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer());
        return {
          bytes,
          fileName: meta?.fileName || file.pathname.split("/").pop() || "song",
          contentType: meta?.contentType || res.headers.get("content-type") || "application/octet-stream",
        };
      }
    }
    const result = await get(file.pathname, { access });
    if (!result || result.statusCode !== 200) return null;
    const bytes = await streamToBuffer(result.stream);
    if (!bytes) return null;
    return {
      bytes,
      fileName: meta?.fileName || file.pathname.split("/").pop() || "song",
      contentType: meta?.contentType || result.blob.contentType || "application/octet-stream",
    };
  } catch {
    return null;
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

export function storeUnavailableMessage() {
  if (remoteStoreMode() === "none") {
    return "Remote operator needs Vercel Blob on production. Set BLOB_READ_WRITE_TOKEN (same store as guest Share).";
  }
  return "Remote channel is not available.";
}
