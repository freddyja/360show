import { clientShareOrigin } from "@/lib/share/origin";

export type CrowdPhase = "idle" | "countdown" | "recording" | "processing" | "ready";

export interface CrowdNowPlaying {
  eventId: string;
  clipId: string | null;
  remoteVideoUrl: string | null;
  phase: CrowdPhase;
  count?: number;
  updatedAt: number;
}

export const CROWD_CHANNEL = "360show-crowd";

export function crowdStorageKey(eventId: string) {
  return `360show:crowd:${eventId}`;
}

export function crowdPath(eventId: string, clipId?: string | null) {
  const base = `/e/${encodeURIComponent(eventId)}/crowd`;
  return clipId ? `${base}?c=${encodeURIComponent(clipId)}` : base;
}

export function crowdUrl(eventId: string, origin?: string, clipId?: string | null) {
  return `${clientShareOrigin(origin)}${crowdPath(eventId, clipId)}`;
}

export function readCrowd(eventId: string): CrowdNowPlaying | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(crowdStorageKey(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CrowdNowPlaying;
    if (!parsed || parsed.eventId !== eventId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function publishCrowd(state: CrowdNowPlaying) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(crowdStorageKey(state.eventId), JSON.stringify(state));
  } catch {
    // quota / private mode
  }
  try {
    const channel = new BroadcastChannel(CROWD_CHANNEL);
    channel.postMessage(state);
    channel.close();
  } catch {
    // BroadcastChannel unsupported
  }
}

export function subscribeCrowd(eventId: string, onState: (state: CrowdNowPlaying) => void) {
  if (typeof window === "undefined") return () => undefined;

  const fromStorage = (raw: string | null) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as CrowdNowPlaying;
      if (parsed?.eventId === eventId) onState(parsed);
    } catch {
      // ignore
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === crowdStorageKey(eventId)) fromStorage(event.newValue);
  };

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CROWD_CHANNEL);
    channel.onmessage = (event: MessageEvent<CrowdNowPlaying>) => {
      if (event.data?.eventId === eventId) onState(event.data);
    };
  } catch {
    channel = null;
  }

  window.addEventListener("storage", onStorage);
  const initial = readCrowd(eventId);
  if (initial) onState(initial);

  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}
