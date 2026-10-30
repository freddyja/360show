"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Play, Square, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  RemoteHttpError,
  clearTabletPair,
  readTabletPair,
  tabletCommand,
  tabletJoin,
  tabletStatus,
  writeTabletPair,
  type TabletPair,
} from "@/lib/remote/tabletClient";
import { REMOTE_BOOTH_ONLINE_MS, REMOTE_POLL_MS, isEventId, type RemotePublicView } from "@/lib/remote/types";

const MAX_BACKOFF_MS = 10_000;

type Link = "live" | "reconnecting" | "lost";

const PHASE_LABEL: Record<string, string> = {
  idle: "IDLE",
  countdown: "COUNTDOWN",
  recording: "RECORDING",
  processing: "PROCESSING",
};

export function TabletOperatorScreen() {
  const search = useSearchParams();
  const [pair, setPair] = useState<TabletPair | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [view, setView] = useState<RemotePublicView | null>(null);
  const [lastOkAt, setLastOkAt] = useState(0);
  const [failures, setFailures] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<"startSpin" | "stopSpin" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const failuresRef = useRef(0);

  // Pairing source: QR link (?e=&k=), then ?code=, then the saved pair.
  useEffect(() => {
    const e = search.get("e")?.trim() || "";
    const k = search.get("k")?.trim() || "";
    const c = search.get("code")?.trim() || "";
    if (isEventId(e) && k) {
      const next = { eventId: e, token: k, pairCode: "" };
      writeTabletPair(next);
      setPair(next);
      window.history.replaceState(null, "", "/tablet");
    } else {
      setPair(readTabletPair());
      if (c) setCode(c.toUpperCase());
    }
    setLoaded(true);
  }, [search]);

  // Keep the screen awake while operating (best effort).
  useEffect(() => {
    if (!pair) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = () => {
      if (document.visibilityState === "visible" && nav.wakeLock) {
        nav.wakeLock.request("screen").then((l) => (lock = l), () => undefined);
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [pair]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const unpair = useCallback((message?: string) => {
    clearTabletPair();
    setPair(null);
    setView(null);
    setError(message ?? null);
  }, []);

  // Poll booth state with exponential backoff on failures; resume on focus / online.
  useEffect(() => {
    if (!pair) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      window.clearTimeout(timer);
      try {
        const data = await tabletStatus(pair.eventId, pair.token);
        if (cancelled) return;
        setView(data.view);
        setLastOkAt(Date.now());
        failuresRef.current = 0;
        setFailures(0);
        setError(null);
        if (data.view.pairCode && data.view.pairCode !== pair.pairCode) {
          writeTabletPair({ ...pair, pairCode: data.view.pairCode });
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof RemoteHttpError && err.status === 401) {
          unpair("The booth ended this remote session. Enter the new code from the booth screen.");
          return;
        }
        failuresRef.current += 1;
        setFailures(failuresRef.current);
        setError(err instanceof Error ? err.message : "Could not reach the booth.");
      }
      if (cancelled) return;
      const delay = failuresRef.current
        ? Math.min(MAX_BACKOFF_MS, REMOTE_POLL_MS * 2 ** Math.min(failuresRef.current, 4))
        : REMOTE_POLL_MS;
      timer = window.setTimeout(() => void poll(), delay);
    };
    const kick = () => {
      if (document.visibilityState === "visible") void poll();
    };
    void poll();
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [pair, unpair]);

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setError(null);
    try {
      const data = await tabletJoin(code);
      const next = { eventId: data.eventId, token: data.token, pairCode: data.pairCode };
      writeTabletPair(next);
      setPair(next);
      setView(data.view);
      setLastOkAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pair.");
    } finally {
      setJoining(false);
    }
  }

  async function send(type: "startSpin" | "stopSpin") {
    if (!pair || sending) return;
    setSending(type);
    setNotice(null);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(30);
    try {
      const result = await tabletCommand(pair.eventId, pair.token, type);
      if (result.view) setView(result.view);
      setNotice(
        result.alreadyQueued
          ? "START is already waiting on the booth."
          : type === "startSpin"
            ? "START sent — waiting for the booth…"
            : "STOP sent — waiting for the booth…",
      );
    } catch (err) {
      if (err instanceof RemoteHttpError && err.status === 401) {
        unpair("The booth ended this remote session. Enter the new code from the booth screen.");
      } else {
        setNotice(err instanceof Error ? `Not sent: ${err.message}` : "Not sent. Check Wi-Fi and tap again.");
      }
    } finally {
      setSending(null);
    }
  }

  if (!loaded) return <div className="min-h-dvh bg-[#07101c]" />;

  if (!pair) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#07101c] p-6 text-white">
        <h1 className="text-3xl font-semibold">Booth Remote</h1>
        <p className="max-w-md text-center text-slate-300">
          On the booth, open Capture → <b>Enable remote control</b>. Scan the <b>Tablet</b> QR, or type the 6-character code.
        </p>
        <form onSubmit={onJoin} className="flex w-full max-w-md flex-col gap-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            placeholder="ABC123"
            aria-label="Pair code"
            className="h-20 rounded-2xl border border-white/20 bg-black/40 text-center font-mono text-4xl tracking-[0.4em] outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={joining || code.replace(/[^A-Z0-9]/gi, "").length !== 6}
            className="h-20 rounded-2xl bg-cyan-500 text-2xl font-semibold text-slate-950 disabled:opacity-40"
          >
            {joining ? "Pairing…" : "Pair with booth"}
          </button>
        </form>
        {error && <p className="max-w-md text-center text-red-300">{error}</p>}
      </main>
    );
  }

  const phase = view?.boothPhase ?? "idle";
  const boothAge = view?.boothHeartbeatAt ? now - view.boothHeartbeatAt : Infinity;
  const tabletAge = lastOkAt ? now - lastOkAt : Infinity;
  const link: Link = failures === 0 && tabletAge < REMOTE_POLL_MS * 4 ? "live" : failures < 4 ? "reconnecting" : "lost";
  const boothOnline = view?.connection === "paired" && boothAge < REMOTE_BOOTH_ONLINE_MS;
  const stale = link !== "live" || !boothOnline;
  const busy = phase !== "idle";
  const pending = view?.pendingCommand;
  const ack = view?.lastAck;

  return (
    <main className="flex min-h-dvh flex-col gap-4 bg-[#07101c] p-4 text-white sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Booth Remote</p>
          <p className="text-xl font-semibold">{view?.snapshot.name || "Connecting…"}</p>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium",
            link === "live" && boothOnline && "bg-emerald-500/20 text-emerald-200",
            link === "live" && !boothOnline && "bg-amber-500/20 text-amber-100",
            link !== "live" && "bg-red-500/20 text-red-200",
          )}
        >
          {link === "live" ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {link === "live"
            ? boothOnline
              ? "Booth connected"
              : "Booth not responding — is Capture open?"
            : link === "reconnecting"
              ? "Reconnecting…"
              : "Connection lost — retrying"}
        </div>
      </header>

      <section
        className={cn(
          "rounded-3xl border p-6 text-center transition-opacity",
          stale && "opacity-60",
          phase === "recording" && "border-red-400/60 bg-red-500/15",
          phase === "countdown" && "border-amber-300/60 bg-amber-400/10",
          phase === "processing" && "border-cyan-300/60 bg-cyan-400/10",
          phase === "idle" && "border-white/10 bg-white/5",
        )}
        aria-live="polite"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Booth state{stale ? " (last known)" : ""}</p>
        <p className="mt-2 text-5xl font-black tracking-wider sm:text-7xl">{PHASE_LABEL[phase] ?? phase}</p>
        <p className="mt-2 text-slate-300">{view?.boothStatus || "—"}</p>
        <p className="mt-1 text-xs text-slate-500">
          {Number.isFinite(boothAge) ? `Booth updated ${Math.max(0, Math.round(boothAge / 1000))}s ago` : "Waiting for booth…"}
        </p>
      </section>

      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void send("startSpin")}
          disabled={Boolean(sending) || busy || pending?.type === "startSpin"}
          className="flex min-h-[38vh] select-none flex-col items-center justify-center gap-3 rounded-3xl bg-emerald-500 text-5xl font-black text-slate-950 shadow-lg active:scale-[0.98] disabled:opacity-35"
        >
          <Play className="h-20 w-20" />
          {sending === "startSpin" ? "SENDING…" : "START"}
        </button>
        <button
          type="button"
          onClick={() => void send("stopSpin")}
          disabled={Boolean(sending) || (!busy && pending?.type !== "startSpin")}
          className="flex min-h-[38vh] select-none flex-col items-center justify-center gap-3 rounded-3xl bg-red-500 text-5xl font-black text-white shadow-lg active:scale-[0.98] disabled:opacity-35"
        >
          <Square className="h-20 w-20" />
          {sending === "stopSpin" ? "SENDING…" : "STOP"}
        </button>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <div className="space-y-1">
          {notice && <p className="text-slate-200">{notice}</p>}
          {pending && !(busy && pending.type === "startSpin") && <p>Waiting on booth: {pending.type === "startSpin" ? "START" : pending.type === "stopSpin" ? "STOP" : pending.type}</p>}
          {ack && (
            <p className={ack.ok ? "text-emerald-300" : "text-amber-200"}>
              Booth: {ack.message || (ack.ok ? "OK" : "Failed")}
            </p>
          )}
          {error && link !== "live" && <p className="text-red-300">{error}</p>}
        </div>
        <button
          type="button"
          className="rounded-full border border-white/15 px-4 py-2 text-slate-200"
          onClick={() => unpair()}
        >
          Unpair
        </button>
      </footer>
    </main>
  );
}
