"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as db from "./db";
import { sampleEvent } from "./seed";
import type { AppSettings, BoothEvent, Clip } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { customMusicBlobId } from "./music/custom";
import {
  formatCustomMusicError,
  isMaterializedCustomMusic,
  isQuotaExceededError,
  materializeCustomMusicFile,
} from "./music/ingest";
import { forgetCustomMusicSrc } from "./music/resolve";
import * as cloud from "./cloud/client";

interface BoothStore {
  ready: boolean;
  error: string | null;
  events: BoothEvent[];
  clips: Clip[];
  settings: AppSettings;
  activeEventId: string | null;
  refresh: () => Promise<void>;
  saveEvent: (
    event: BoothEvent,
    makeActive?: boolean,
    music?: { file: File } | { clear: true },
  ) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  saveClip: (clip: Clip, blob?: Blob | null) => Promise<void>;
  patchClip: (clipId: string, patch: Partial<Clip>) => Promise<void>;
  getBlob: (clipId: string) => Promise<Blob | null>;
  getMusicBlob: (blobId: string) => Promise<Blob | null>;
  getBakedBlob: (clipId: string) => Promise<Blob | null>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  resetAll: () => Promise<void>;
  /** Cloud event/settings sync state (off when BOOTH_OWNER_KEY / Blob aren't set up). */
  cloudStatus: cloud.CloudSyncStatus;
  cloudSyncedAt: number | null;
  setOwnerKey: (key: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<BoothStore | null>(null);

export function BoothProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<BoothEvent[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  const [cloudStatus, setCloudStatus] = useState<cloud.CloudSyncStatus>("needs-key");
  const [cloudSyncedAt, setCloudSyncedAt] = useState<number | null>(null);
  const syncing = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    const [nextEvents, nextClips, nextSettings, nextActive] = await Promise.all([
      db.listEvents(),
      db.listClips(),
      db.getSettings(),
      db.getActiveEventId(),
    ]);
    setEvents(nextEvents);
    setClips(nextClips);
    setSettings(nextSettings);
    setActiveEventId(nextActive);
  }, []);

  /**
   * Merge local IndexedDB events + tombstones with the cloud (last-write-wins by
   * updatedAt), push local winners (first run = migration of existing events),
   * and merge synced settings the same way. Never throws; offline stays local.
   */
  const syncNow = useCallback(async () => {
    if (syncing.current) return syncing.current;
    const run = (async () => {
      const listed = await cloud.cloudListEvents();
      setCloudStatus(listed.status);
      if (listed.status !== "ok" || !listed.data) return;
      const local = await db.listEvents();
      const plan = cloud.planEventMerge(local, cloud.localTombstones(), listed.data.events);
      for (const e of plan.applyLocal) await db.putEvent(e);
      for (const id of plan.deleteLocal) {
        await db.deleteEvent(id);
        if ((await db.getActiveEventId()) === id) await db.setActiveEventId(null);
      }
      if (plan.push.length) await cloud.cloudPutEvents(plan.push);

      const remote = await cloud.cloudGetSettings();
      const localSettings = await db.getSettings();
      const localAt = cloud.localSettingsUpdatedAt();
      if (remote.status === "ok" && remote.data) {
        if (remote.data.updatedAt > localAt) {
          const merged = { ...localSettings, ...remote.data.settings };
          await db.putSettings(merged);
          cloud.markLocalSettings(merged, remote.data.updatedAt);
        } else if (localAt > remote.data.updatedAt || !remote.data.updatedAt) {
          const at = localAt || Date.now();
          await cloud.cloudPutSettings({ updatedAt: at, settings: cloud.pickSynced(localSettings) });
          cloud.markLocalSettings(localSettings, at);
        }
      }
      setCloudSyncedAt(Date.now());
      await refresh();
    })().finally(() => {
      syncing.current = null;
    });
    syncing.current = run;
    return run;
  }, [refresh]);

  const setOwnerKey = useCallback(
    async (key: string) => {
      cloud.writeOwnerKey(key);
      await syncNow();
    },
    [syncNow],
  );

  useEffect(() => {
    if (!ready) return;
    void syncNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [ready, syncNow]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await db.isSeeded())) {
          const event = sampleEvent();
          await db.putEvent(event);
          await db.setActiveEventId(event.id);
          await db.putSettings(DEFAULT_SETTINGS);
          await db.markSeeded();
        }
        if (!cancelled) {
          await refresh();
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to open local storage");
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const saveEvent = useCallback(
    async (event: BoothEvent, makeActive = false, music?: { file: File } | { clear: true }) => {
      let next = event;
      if (music && "file" in music) {
        const blobId = customMusicBlobId(event.id);
        const local = isMaterializedCustomMusic(music.file)
          ? music.file
          : await materializeCustomMusicFile(music.file);
        try {
          await db.putNamedBlob(blobId, local);
        } catch (error) {
          if (isQuotaExceededError(error) && event.customMusicBlobId && event.customMusicBlobId !== blobId) {
            forgetCustomMusicSrc(event.customMusicBlobId);
            await db.deleteNamedBlob(event.customMusicBlobId);
            try {
              await db.putNamedBlob(blobId, local);
            } catch (retryError) {
              throw new Error(formatCustomMusicError(retryError));
            }
          } else {
            throw new Error(formatCustomMusicError(error));
          }
        }
        if (event.customMusicBlobId && event.customMusicBlobId !== blobId) {
          forgetCustomMusicSrc(event.customMusicBlobId);
          await db.deleteNamedBlob(event.customMusicBlobId);
        }
        next = {
          ...event,
          customMusicBlobId: blobId,
          customMusicName: local.name,
          preferBundledBed: false,
        };
      } else if (music && "clear" in music) {
        if (event.customMusicBlobId) {
          forgetCustomMusicSrc(event.customMusicBlobId);
          await db.deleteNamedBlob(event.customMusicBlobId);
        }
        next = { ...event, customMusicBlobId: null, customMusicName: null };
      }
      next = { ...next, updatedAt: Math.max(Date.now(), (next.updatedAt || 0) + 1) };
      await db.putEvent(next);
      cloud.setLocalTombstone(next.id, null);
      if (makeActive) await db.setActiveEventId(next.id);
      await refresh();
      void cloud.cloudPutEvent(cloud.toCloudEvent(next)).then((r) => setCloudStatus(r.status));
    },
    [refresh],
  );

  const removeEvent = useCallback(async (id: string) => {
    await db.deleteEvent(id);
    const at = Date.now();
    cloud.setLocalTombstone(id, at);
    void cloud.cloudDeleteEvent(id, at).then((r) => setCloudStatus(r.status));
    const active = await db.getActiveEventId();
    if (active === id) await db.setActiveEventId(null);
    await refresh();
  }, [refresh]);

  const saveClip = useCallback(async (clip: Clip, blob?: Blob | null) => {
    await db.putClip(clip, blob);
    await refresh();
  }, [refresh]);

  const patchClip = useCallback(async (clipId: string, patch: Partial<Clip>) => {
    const current = await db.getClip(clipId);
    if (!current) return;
    await db.putClip({ ...current, ...patch });
    await refresh();
  }, [refresh]);

  const getBlob = useCallback(async (clipId: string) => db.getClipBlob(clipId), []);

  const getMusicBlob = useCallback(async (blobId: string) => db.getNamedBlob(blobId), []);

  const getBakedBlob = useCallback(async (clipId: string) => db.getBakedBlob(clipId), []);

  const saveSettings = useCallback(async (next: AppSettings) => {
    await db.putSettings(next);
    setSettings(next);
    const at = Date.now();
    cloud.markLocalSettings(next, at);
    void cloud.cloudPutSettings({ updatedAt: at, settings: cloud.pickSynced(next) }).then((r) => setCloudStatus(r.status));
  }, []);

  const setActive = useCallback(async (id: string | null) => {
    await db.setActiveEventId(id);
    setActiveEventId(id);
  }, []);

  const resetAll = useCallback(async () => {
    await db.clearAllData();
    const event = sampleEvent();
    await db.putEvent(event);
    await db.setActiveEventId(event.id);
    await db.putSettings(DEFAULT_SETTINGS);
    await db.markSeeded();
    await refresh();
  }, [refresh]);

  const value = useMemo<BoothStore>(
    () => ({
      ready,
      error,
      events,
      clips,
      settings,
      activeEventId,
      refresh,
      saveEvent,
      removeEvent,
      saveClip,
      patchClip,
      getBlob,
      getMusicBlob,
      getBakedBlob,
      saveSettings,
      setActive,
      resetAll,
      cloudStatus,
      cloudSyncedAt,
      setOwnerKey,
      syncNow,
    }),
    [
      ready,
      error,
      events,
      clips,
      settings,
      activeEventId,
      refresh,
      saveEvent,
      removeEvent,
      saveClip,
      patchClip,
      getBlob,
      getMusicBlob,
      getBakedBlob,
      saveSettings,
      setActive,
      resetAll,
      cloudStatus,
      cloudSyncedAt,
      setOwnerKey,
      syncNow,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBooth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBooth must be used within BoothProvider");
  return ctx;
}

export function useEvent(eventId: string | undefined) {
  const { events, clips } = useBooth();
  const event = events.find((item) => item.id === eventId);
  const eventClips = clips.filter((clip) => clip.eventId === eventId);
  const latestClip = eventClips[0] ?? null;
  return { event, eventClips, latestClip };
}
