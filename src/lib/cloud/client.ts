"use client";

import type { AppSettings, BoothEvent } from "@/lib/types";
import type {
  CloudEventRecord,
  CloudSettingsRecord,
  SyncedSettings,
} from "./types";

const KEY_STORAGE = "360show:ownerKey";
const TOMBSTONES = "360show:eventTombstones";
const SETTINGS_AT = "360show:settingsUpdatedAt";
const SETTINGS_CACHE = "360show:settingsCache";

export type CloudSyncStatus =
  "off" | "needs-key" | "bad-key" | "ok" | "offline";

export function readOwnerKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function writeOwnerKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {}
}

function readMap(key: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}

export function localTombstones() {
  return readMap(TOMBSTONES);
}

export function setLocalTombstone(id: string, at: number | null) {
  const map = readMap(TOMBSTONES);
  if (at === null) delete map[id];
  else map[id] = at;
  try {
    localStorage.setItem(TOMBSTONES, JSON.stringify(map));
  } catch {}
}

export function localSettingsUpdatedAt() {
  try {
    return Number(localStorage.getItem(SETTINGS_AT)) || 0;
  } catch {
    return 0;
  }
}

/** localStorage copy of synced settings: fast cache + offline fallback beside IndexedDB. */
export function markLocalSettings(settings: AppSettings, at: number) {
  try {
    localStorage.setItem(SETTINGS_AT, String(at));
    localStorage.setItem(SETTINGS_CACHE, JSON.stringify(pickSynced(settings)));
  } catch {}
}

export function pickSynced(s: AppSettings): SyncedSettings {
  // deviceName, mockBatteryPct, forceOffline stay per device.
  const { deviceName: _d, mockBatteryPct: _m, forceOffline: _f, ...rest } = s;
  void _d;
  void _m;
  void _f;
  return rest;
}

type Result<T> = { status: CloudSyncStatus; data?: T };

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  const key = readOwnerKey();
  if (!key) return { status: "needs-key" };
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return { status: "offline" };
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-booth-key": key,
        ...(init?.headers || {}),
      },
    });
    if (res.status === 503) return { status: "off" };
    if (res.status === 401) return { status: "bad-key" };
    if (!res.ok) return { status: "offline" };
    return { status: "ok", data: (await res.json()) as T };
  } catch {
    return { status: "offline" };
  }
}

export const cloudListEvents = () =>
  call<{ events: CloudEventRecord[] }>("/api/events");
export const cloudPutEvents = (events: CloudEventRecord[]) =>
  call<{ events: CloudEventRecord[] }>("/api/events", {
    method: "PUT",
    body: JSON.stringify({ events }),
  });
export const cloudPutEvent = (record: CloudEventRecord) =>
  call<CloudEventRecord>(`/api/events/${encodeURIComponent(record.id)}`, {
    method: "PUT",
    body: JSON.stringify(record),
  });
export const cloudDeleteEvent = (id: string, at: number) =>
  call<CloudEventRecord>(
    `/api/events/${encodeURIComponent(id)}?updatedAt=${at}`,
    { method: "DELETE" },
  );
export const cloudGetSettings = () =>
  call<CloudSettingsRecord>("/api/settings");
export const cloudPutSettings = (record: CloudSettingsRecord) =>
  call<CloudSettingsRecord>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(record),
  });

/** Customer song bytes stay on this device; only drop the local blob pointer when it's a different device. */
export function toCloudEvent(event: BoothEvent): CloudEventRecord {
  return {
    id: event.id,
    updatedAt: event.updatedAt || event.createdAt || 0,
    event,
  };
}

export interface MergePlan {
  applyLocal: BoothEvent[];
  deleteLocal: string[];
  push: CloudEventRecord[];
}

/** Last-write-wins by updatedAt across local events, local tombstones and cloud records. */
export function planEventMerge(
  local: BoothEvent[],
  tombstones: Record<string, number>,
  cloud: CloudEventRecord[],
): MergePlan {
  const plan: MergePlan = { applyLocal: [], deleteLocal: [], push: [] };
  const localById = new Map(local.map((e) => [e.id, e]));
  const cloudById = new Map(cloud.map((r) => [r.id, r]));
  const ids = new Set([
    ...localById.keys(),
    ...Object.keys(tombstones),
    ...cloudById.keys(),
  ]);
  for (const id of ids) {
    const le = localById.get(id);
    const lt = tombstones[id];
    const localRec: CloudEventRecord | null = le
      ? toCloudEvent(le)
      : lt
        ? { id, updatedAt: lt, deleted: true }
        : null;
    const remote = cloudById.get(id) || null;
    // A never-edited seeded sample on a fresh device must not overwrite the cloud copy.
    const pristineSample = Boolean(
      le?.isSample && le.updatedAt === le.createdAt,
    );
    if (remote && pristineSample) {
      if (remote.deleted) plan.deleteLocal.push(id);
      else if (remote.event && remote.updatedAt !== le!.updatedAt)
        plan.applyLocal.push({
          ...remote.event,
          customMusicBlobId: le?.customMusicBlobId ?? null,
        });
      continue;
    }
    if (localRec && (!remote || localRec.updatedAt > remote.updatedAt)) {
      plan.push.push(localRec);
    } else if (remote && (!localRec || remote.updatedAt > localRec.updatedAt)) {
      if (remote.deleted) {
        if (le) plan.deleteLocal.push(id);
      } else if (remote.event) {
        // Keep this device's custom-song pointer; the song file itself never syncs.
        plan.applyLocal.push({
          ...remote.event,
          customMusicBlobId: le?.customMusicBlobId ?? null,
          customMusicName: le?.customMusicBlobId
            ? le.customMusicName
            : (remote.event.customMusicName ?? null),
        });
      }
    }
  }
  return plan;
}
