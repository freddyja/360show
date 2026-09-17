"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
}

const Ctx = createContext<BoothStore | null>(null);

export function BoothProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<BoothEvent[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

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
      await db.putEvent(next);
      if (makeActive) await db.setActiveEventId(next.id);
      await refresh();
    },
    [refresh],
  );

  const removeEvent = useCallback(async (id: string) => {
    await db.deleteEvent(id);
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
