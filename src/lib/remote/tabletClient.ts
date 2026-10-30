"use client";

import type { RemoteCommandPayload, RemoteCommandType, RemotePublicView } from "./types";

/** Tablet pairing survives reloads and add-to-home-screen launches (localStorage, not sessionStorage). */
const TABLET_PAIR_KEY = "360show.tablet.pair";

export interface TabletPair {
  eventId: string;
  token: string;
  pairCode: string;
}

export function readTabletPair(): TabletPair | null {
  if (typeof window === "undefined") return null;
  try {
    const data = JSON.parse(localStorage.getItem(TABLET_PAIR_KEY) || "null") as TabletPair | null;
    return data?.eventId && data.token ? data : null;
  } catch {
    return null;
  }
}

export function writeTabletPair(pair: TabletPair) {
  localStorage.setItem(TABLET_PAIR_KEY, JSON.stringify(pair));
}

export function clearTabletPair() {
  localStorage.removeItem(TABLET_PAIR_KEY);
}

export class RemoteHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new RemoteHttpError(data.error || `Request failed (${res.status})`, res.status);
  return data;
}

function withTimeout(ms: number) {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => window.clearTimeout(timer) };
}

/** Pair with just the 6-character code shown on the booth Capture screen (event id optional). */
export async function tabletJoin(pairCode: string, eventId?: string) {
  const t = withTimeout(10_000);
  try {
    const res = await fetch("/api/remote/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairCode, ...(eventId ? { eventId } : {}) }),
      signal: t.signal,
    });
    return await json<{ eventId: string; token: string; pairCode: string; view: RemotePublicView }>(res);
  } finally {
    t.done();
  }
}

export async function tabletStatus(eventId: string, token: string) {
  const t = withTimeout(8_000);
  try {
    const res = await fetch(
      `/api/remote/status?eventId=${encodeURIComponent(eventId)}&token=${encodeURIComponent(token)}`,
      { cache: "no-store", signal: t.signal },
    );
    return await json<{ view: RemotePublicView }>(res);
  } finally {
    t.done();
  }
}

function newClientId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Send START / STOP / a setting with a stable clientId and retry on network errors / 5xx,
 * so a flaky Wi-Fi tap lands exactly once. A 409 on START means a START is
 * already queued on the booth, which is the outcome the operator wanted.
 */
export async function tabletCommand(
  eventId: string,
  token: string,
  type: RemoteCommandType,
  payload: RemoteCommandPayload = {},
) {
  const clientId = newClientId();
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const t = withTimeout(8_000);
    try {
      const res = await fetch("/api/remote/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, token, type, payload, clientId }),
        signal: t.signal,
      });
      if (res.status === 409 && type === "startSpin") {
        return { ok: true, alreadyQueued: true as const, view: null };
      }
      const data = await json<{ ok: boolean; commandId: string; duplicate?: boolean; superseded?: string[]; view: RemotePublicView }>(res);
      return { ok: true, alreadyQueued: false as const, view: data.view, commandId: data.commandId, superseded: data.superseded?.length ?? 0 };
    } catch (error) {
      lastError = error;
      if (error instanceof RemoteHttpError && error.status < 500) throw error;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    } finally {
      t.done();
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not reach the booth.");
}
