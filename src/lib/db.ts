import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AppSettings, BoothEvent, Clip } from "./types";
import { DEFAULT_SETTINGS, resolveCaptureDurationSec } from "./types";
import { normalizeMusicBedLabel } from "./music/beds";

interface Snap360Schema extends DBSchema {
  events: {
    key: string;
    value: BoothEvent;
  };
  clips: {
    key: string;
    value: Clip;
    indexes: { "by-event": string };
  };
  blobs: {
    key: string;
    value: Blob;
  };
  kv: {
    key: string;
    value: unknown;
  };
}

function hydrateEvent(event: BoothEvent): BoothEvent {
  return {
    ...event,
    musicBedLabel: normalizeMusicBedLabel(event.musicBedLabel),
    customMusicBlobId: event.customMusicBlobId || null,
    customMusicName: event.customMusicName || null,
    captureDurationSec: resolveCaptureDurationSec(event.captureDurationSec),
  };
}

const DB_NAME = "snap360-booth";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<Snap360Schema>> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available");
  }
  if (!dbPromise) {
    dbPromise = openDB<Snap360Schema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("events")) {
          db.createObjectStore("events", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("clips")) {
          const clips = db.createObjectStore("clips", { keyPath: "id" });
          clips.createIndex("by-event", "eventId");
        }
        if (!db.objectStoreNames.contains("blobs")) {
          db.createObjectStore("blobs");
        }
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
      },
    });
  }
  return dbPromise;
}

export async function listEvents(): Promise<BoothEvent[]> {
  const db = await getDb();
  const events = await db.getAll("events");
  return events.map(hydrateEvent).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getEvent(id: string) {
  const db = await getDb();
  const event = await db.get("events", id);
  return event ? hydrateEvent(event) : event;
}

export async function putEvent(event: BoothEvent) {
  const db = await getDb();
  await db.put("events", hydrateEvent(event));
}

export async function deleteEvent(id: string) {
  const db = await getDb();
  const event = await db.get("events", id);
  const clips = await db.getAllFromIndex("clips", "by-event", id);
  const blobKeys = await db.getAllKeys("blobs");
  const tx = db.transaction(["events", "clips", "blobs"], "readwrite");
  await tx.objectStore("events").delete(id);
  for (const clip of clips) {
    await tx.objectStore("clips").delete(clip.id);
  }
  for (const key of blobKeys) {
    const k = String(key);
    const clipHit = clips.some((clip) => k === clip.id || k.startsWith(`${clip.id}__`));
    const musicHit = k === event?.customMusicBlobId || k.startsWith(`music:${id}`);
    if (clipHit || musicHit) await tx.objectStore("blobs").delete(key);
  }
  await tx.done;
}

export async function listClips(eventId?: string): Promise<Clip[]> {
  const db = await getDb();
  const clips = eventId
    ? await db.getAllFromIndex("clips", "by-event", eventId)
    : await db.getAll("clips");
  return clips.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getClip(id: string) {
  const db = await getDb();
  return db.get("clips", id);
}

export async function putClip(clip: Clip, blob?: Blob | null) {
  const db = await getDb();
  const tx = db.transaction(["clips", "blobs"], "readwrite");
  await tx.objectStore("clips").put(clip);
  if (blob) {
    await tx.objectStore("blobs").put(blob, clip.id);
  }
  await tx.done;
}

const BLOB_WRITE_MS = 15_000;

function isQuotaExceededError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String((error as { message?: unknown }).message) : "";
  const code = "code" in error ? Number((error as { code?: unknown }).code) : NaN;
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    /quota/i.test(message)
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(timeoutMessage);
      err.name = "TimeoutError";
      reject(err);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function mapBlobStoreError(error: unknown): Error {
  if (isQuotaExceededError(error)) {
    const err = new Error(
      "This phone is out of storage for that song. Free some space, clear the current custom song, or pick a smaller file.",
    );
    err.name = "QuotaExceededError";
    return err;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return error;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return error;
  }
  if (error instanceof Error) return error;
  return new Error("Could not save that file on this phone.");
}

export async function getNamedBlob(key: string) {
  const db = await getDb();
  return (await db.get("blobs", key)) ?? null;
}

export async function putNamedBlob(key: string, blob: Blob) {
  try {
    const db = await getDb();
    await withTimeout(
      db.put("blobs", blob, key),
      BLOB_WRITE_MS,
      "Saving the song on this phone timed out. Try a smaller file.",
    );
  } catch (error) {
    throw mapBlobStoreError(error);
  }
}

export async function deleteNamedBlob(key: string) {
  const db = await getDb();
  await db.delete("blobs", key);
}

export async function getClipBlob(id: string) {
  const db = await getDb();
  return (await db.get("blobs", id)) ?? null;
}

export async function getBakedBlob(id: string, key?: string) {
  const db = await getDb();
  return (await db.get("blobs", key ?? `${id}__baked`)) ?? null;
}

export async function putBakedBlob(clipId: string, blob: Blob, key?: string) {
  const db = await getDb();
  await db.put("blobs", blob, key ?? `${clipId}__baked`);
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const stored = (await db.get("kv", "settings")) as AppSettings | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    cloudDestination: stored?.cloudDestination === "drive" ? "drive" : "blob",
    driveFolderName: stored?.driveFolderName?.trim() || DEFAULT_SETTINGS.driveFolderName,
    slowMoEnabled: stored?.slowMoEnabled !== false,
    videoQuality: stored?.videoQuality === "standard" ? "standard" : "high",
    boothMusicMuted: stored?.boothMusicMuted === true,
  };
}

export async function putSettings(settings: AppSettings) {
  const db = await getDb();
  await db.put("kv", settings, "settings");
}

export async function getActiveEventId() {
  const db = await getDb();
  return ((await db.get("kv", "activeEventId")) as string | null | undefined) ?? null;
}

export async function setActiveEventId(id: string | null) {
  const db = await getDb();
  await db.put("kv", id, "activeEventId");
}

export async function isSeeded() {
  const db = await getDb();
  return Boolean(await db.get("kv", "seeded"));
}

export async function markSeeded() {
  const db = await getDb();
  await db.put("kv", true, "seeded");
}

export async function clearAllData() {
  const db = await getDb();
  const tx = db.transaction(["events", "clips", "blobs", "kv"], "readwrite");
  await tx.objectStore("events").clear();
  await tx.objectStore("clips").clear();
  await tx.objectStore("blobs").clear();
  await tx.objectStore("kv").clear();
  await tx.done;
}
