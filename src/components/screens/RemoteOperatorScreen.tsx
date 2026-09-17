"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Tv } from "lucide-react";
import { FrameOverlay } from "@/components/FrameOverlay";
import { FRAME_STYLES, getFrameStyle } from "@/lib/frames";
import { MUSIC_BEDS, normalizeMusicBedLabel } from "@/lib/music/beds";
import { formatMusicBytes, validateCustomMusicFile } from "@/lib/music/custom";
import { formatCustomMusicError } from "@/lib/music/ingest";
import { crowdUrl } from "@/lib/crowd/channel";
import {
  clearStoredPair,
  joinRemote,
  readStoredPair,
  remoteStatus,
  sendRemoteCommand,
  uploadRemoteMusic,
  waitForRemoteMusicAck,
  writeStoredPair,
} from "@/lib/remote/client";
import {
  REMOTE_POLL_MS,
  boothStatusForPhase,
  type RemoteCommandPayload,
  type RemoteCommandType,
  type RemoteEventSnapshot,
  type RemotePublicView,
} from "@/lib/remote/types";
import { CAPTURE_DURATION_SECS } from "@/lib/types";
import { cn } from "@/lib/cn";

export function RemoteOperatorScreen({ eventId }: { eventId: string }) {
  const search = useSearchParams();
  const urlToken = search.get("k")?.trim() || "";
  const [token, setToken] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [view, setView] = useState<RemotePublicView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copiedCrowd, setCopiedCrowd] = useState(false);
  const [musicUploading, setMusicUploading] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [namesDraft, setNamesDraft] = useState("");
  const musicAbort = useRef<AbortController | null>(null);
  const musicUploadingRef = useRef(false);

  useEffect(() => {
    const stored = readStoredPair(eventId);
    const next = urlToken || stored?.token || "";
    setToken(next);
    if (stored?.pairCode) setPairCode(stored.pairCode);
  }, [eventId, urlToken]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function poll() {
      try {
        const data = await remoteStatus(eventId, token);
        if (cancelled) return;
        setView(data.view);
        setPairCode(data.view.pairCode);
        if (!musicUploadingRef.current) setError(null);
        writeStoredPair(eventId, {
          token,
          pairCode: data.view.pairCode,
          remoteUrl: `${window.location.origin}/e/${eventId}/remote?k=${encodeURIComponent(token)}`,
        });
        if (!urlToken && typeof window !== "undefined") {
          const next = `${window.location.pathname}?k=${encodeURIComponent(token)}`;
          window.history.replaceState(null, "", next);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not reach the booth.");
        setView(null);
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), REMOTE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [eventId, token, urlToken]);

  useEffect(() => {
    return () => {
      musicAbort.current?.abort();
    };
  }, []);

  const snapshot = view?.snapshot;
  useEffect(() => {
    if (!snapshot) return;
    setNameDraft(snapshot.name);
    setNamesDraft(snapshot.clientNames);
  }, [snapshot?.name, snapshot?.clientNames, snapshot]);

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const data = await joinRemote(eventId, joinCode);
      setToken(data.token);
      setPairCode(data.pairCode);
      setView(data.view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pair.");
    }
  }

  const patchSnapshot = useCallback((patch: Partial<RemoteEventSnapshot>) => {
    setView((prev) => (prev ? { ...prev, snapshot: { ...prev.snapshot, ...patch } } : prev));
  }, []);

  const send = useCallback(
    async (type: RemoteCommandType, payload: RemoteCommandPayload = {}, optimistic?: Partial<RemoteEventSnapshot>) => {
      if (!token) return;
      if (optimistic) patchSnapshot(optimistic);
      setSending(true);
      setError(null);
      try {
        const data = await sendRemoteCommand(eventId, token, type, payload);
        setView({
          ...data.view,
          snapshot: { ...data.view.snapshot, ...optimistic },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Command failed.");
      } finally {
        setSending(false);
      }
    },
    [eventId, patchSnapshot, token],
  );

  async function onLaptopSong(file: File | null) {
    if (!file || !token) return;
    const invalid = validateCustomMusicFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    musicAbort.current?.abort();
    const ac = new AbortController();
    musicAbort.current = ac;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => ac.abort(), 120_000);
    musicUploadingRef.current = true;
    setMusicUploading(true);
    setError(null);
    try {
      const data = await uploadRemoteMusic(eventId, token, file, Boolean(snapshot?.blobConfigured), {
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      const settled = await waitForRemoteMusicAck(eventId, token, data.commandId, {
        signal: ac.signal,
        timeoutMs: 45_000,
      });
      if (ac.signal.aborted) return;
      setView({
        ...settled.view,
        snapshot: {
          ...settled.view.snapshot,
          hasCustomMusic: true,
          usingCustomMusic: true,
          preferBundledBed: false,
          customMusicName: file.name,
        },
      });
    } catch (err) {
      if (musicAbort.current !== ac) return;
      if (ac.signal.aborted) {
        const timedOut = Date.now() - startedAt >= 115_000;
        setError(
          timedOut
            ? "Sending the song took too long. Keep Capture open on the phone and try again."
            : "Stopped sending the song to the booth.",
        );
        return;
      }
      setError(
        formatCustomMusicError(err) ||
          (err instanceof Error ? err.message : "Could not send the song to the booth."),
      );
    } finally {
      window.clearTimeout(timer);
      if (musicAbort.current === ac) {
        musicAbort.current = null;
        musicUploadingRef.current = false;
        setMusicUploading(false);
      }
    }
  }

  function onCancelLaptopSong() {
    musicAbort.current?.abort();
  }

  const connection = view?.connection ?? (token ? "offline" : "waiting");
  const paired = connection === "paired";
  const boothBusy = view?.boothPhase && view.boothPhase !== "idle";
  const spinLabel = snapshot ? `${snapshot.captureDurationSec}s` : "10s";
  const crowdHref = crowdUrl(eventId, typeof window === "undefined" ? undefined : window.location.origin, view?.lastClipId);
  const locked = sending || musicUploading || !paired;

  const statusLine = useMemo(() => {
    if (!view) return token ? "Connecting…" : "Not paired";
    if (view.lastAck && Date.now() - view.lastAck.at < 8000 && view.boothPhase === "idle") {
      return view.lastAck.ok ? view.lastAck.message || view.boothStatus : view.lastAck.message;
    }
    return view.boothStatus || boothStatusForPhase(view.boothPhase);
  }, [view, token]);

  if (!token) {
    return (
      <div className="booth-page min-h-dvh p-4 sm:p-8">
        <div className="booth-frame mx-auto max-w-xl rounded-[28px] p-6 sm:p-10">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Remote operator</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Pair this laptop</h1>
          <p className="mt-2 text-slate-300">
            On the booth phone, open Capture → <span className="text-white">Enable remote control</span>,
            then enter the 6-character code here. No account needed.
          </p>
          <form onSubmit={(e) => void onJoin(e)} className="mt-6 flex flex-col gap-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="PAIR CODE"
              autoCapitalize="characters"
              autoComplete="off"
              className="booth-card min-h-14 rounded-2xl border px-4 text-center font-mono text-2xl tracking-[0.4em] text-white outline-none focus:border-cyan-400"
            />
            <button type="submit" className="min-h-12 rounded-full bg-cyan-400 font-medium text-slate-950">
              Pair
            </button>
          </form>
          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="booth-page min-h-dvh p-3 sm:p-6">
      <div className="booth-frame mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-5xl flex-col rounded-[28px] p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-200">Remote operator</p>
            <h1 className="mt-1 text-3xl font-semibold text-white sm:text-4xl">
              {snapshot?.name || "Booth"}
              {snapshot?.clientNames ? ` — ${snapshot.clientNames}` : ""}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Commands run on the phone while Capture is open. Pick a song on this laptop to play on
              the booth; phone library browse, Drive login, logos, and the camera stay on the phone.
            </p>
          </div>
          <ConnectionChip connection={connection} />
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Booth status</p>
          <p className="mt-1 text-xl font-medium text-white">{statusLine}</p>
          {error && <p className="mt-1 text-sm text-red-300">{error}</p>}
          {pairCode && <p className="mt-1 font-mono text-sm tracking-[0.25em] text-slate-500">{pairCode}</p>}
        </div>

        <button
          type="button"
          disabled={locked || boothBusy}
          onClick={() => void send("startSpin")}
          className={cn(
            "group relative mt-6 flex min-h-[200px] items-center justify-center overflow-hidden rounded-[28px] border border-white/10 px-6 text-left disabled:cursor-wait disabled:opacity-60",
            "booth-stage",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_8%_90%,rgba(255,45,149,0.45),transparent_52%),radial-gradient(80%_60%_at_95%_20%,rgba(34,211,238,0.35),transparent_50%)]" />
          <span className="relative text-center">
            <span className="block text-5xl font-semibold tracking-wide text-white sm:text-7xl">
              {view?.boothPhase === "countdown" && "COUNTDOWN"}
              {view?.boothPhase === "recording" && "SPINNING"}
              {view?.boothPhase === "processing" && "SAVING"}
              {(!view || view.boothPhase === "idle") && "START SPIN"}
            </span>
            <span className="mt-2 block text-lg text-slate-300">
              {!paired ? "Waiting for the booth Capture screen" : `Launch ${spinLabel} capture on the phone`}
            </span>
          </span>
        </button>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-500 px-4 text-sm font-medium text-white"
            onClick={() => window.open(crowdHref, "360show-crowd")}
          >
            <Tv className="h-4 w-4" />
            Open crowd / TV screen
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-slate-200"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(crowdHref);
                setCopiedCrowd(true);
                window.setTimeout(() => setCopiedCrowd(false), 2000);
              } catch {
                window.prompt("Copy crowd / TV link", crowdHref);
              }
            }}
          >
            <Copy className="h-4 w-4" />
            {copiedCrowd ? "Copied" : "Copy TV link"}
          </button>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-medium text-white">Event / look</h2>
          <p className="mt-1 text-sm text-slate-400">Applies on the booth for the next spin (and on the live Capture chrome now).</p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">Event name</span>
              <input
                value={nameDraft}
                disabled={locked}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  if (nameDraft.trim() && nameDraft.trim() !== snapshot?.name) {
                    void send("setEventBranding", { name: nameDraft.trim() }, { name: nameDraft.trim() });
                  }
                }}
                className="booth-card min-h-12 w-full rounded-2xl border px-4 text-white outline-none focus:border-blue-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">Couple / client names</span>
              <input
                value={namesDraft}
                disabled={locked}
                onChange={(e) => setNamesDraft(e.target.value)}
                onBlur={() => {
                  const next = namesDraft.trim() || "Guests";
                  if (next !== snapshot?.clientNames) {
                    void send("setEventBranding", { clientNames: next }, { clientNames: next });
                  }
                }}
                className="booth-card min-h-12 w-full rounded-2xl border px-4 text-white outline-none focus:border-blue-400"
              />
            </label>
            <div>
              <span className="mb-2 block text-sm text-slate-400">Accent color</span>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  disabled={locked}
                  value={snapshot?.accentColor || "#3B82F6"}
                  onChange={(e) => void send("setEventBranding", { accentColor: e.target.value }, { accentColor: e.target.value })}
                  className="h-12 w-16 cursor-pointer rounded-xl border border-white/10 bg-transparent"
                />
                <input
                  disabled={locked}
                  value={snapshot?.accentColor || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    patchSnapshot({ accentColor: value });
                    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                      void send("setEventBranding", { accentColor: value }, { accentColor: value });
                    }
                  }}
                  className="booth-card min-h-12 flex-1 rounded-2xl border px-4 text-white outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <div>
              <span className="mb-2 block text-sm text-slate-400">Spin length</span>
              <div className="grid grid-cols-3 gap-2">
                {CAPTURE_DURATION_SECS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    disabled={locked}
                    onClick={() => void send("setSpinLength", { captureDurationSec: sec }, { captureDurationSec: sec })}
                    className={cn(
                      "min-h-12 rounded-2xl border text-base font-medium",
                      snapshot?.captureDurationSec === sec
                        ? "border-blue-400 bg-blue-500/10 text-white"
                        : "booth-card border-white/10 text-slate-200",
                    )}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-sm text-slate-400">Music bed</span>
            <select
              disabled={locked}
              value={normalizeMusicBedLabel(snapshot?.musicBedLabel)}
              onChange={(e) => {
                const musicBedLabel = e.target.value as (typeof MUSIC_BEDS)[number];
                void send(
                  "setMusicBed",
                  { musicBedLabel },
                  { musicBedLabel, preferBundledBed: true, usingCustomMusic: false },
                );
              }}
              className="booth-card min-h-12 w-full rounded-2xl border px-4 text-white outline-none focus:border-blue-400"
            >
              {MUSIC_BEDS.map((bed) => (
                <option key={bed} value={bed}>
                  {bed}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              Bundled beds or None apply on the booth. A song picked here uploads over the pair channel
              into the phone’s IndexedDB and wins until you pick a bed again.
              {snapshot?.usingCustomMusic && snapshot.customMusicName
                ? ` Now playing on the booth: ${snapshot.customMusicName}.`
                : snapshot?.hasCustomMusic && snapshot.customMusicName
                  ? ` A custom file is stored on the phone (${snapshot.customMusicName}) but a bundled bed is selected.`
                  : ""}
            </p>
            {snapshot?.remoteMusicAvailable === false ? (
              <p className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Laptop song upload is paused while Vercel Blob is unavailable. Pick a song on the booth
                phone in Event setup instead.
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="relative flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-500/15 px-4 text-center text-sm font-medium text-white">
                    {musicUploading ? "Uploading to booth…" : "Use song from this laptop"}
                    <input
                      type="file"
                      accept="audio/*,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg,.flac"
                      disabled={locked}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        void onLaptopSong(file);
                      }}
                    />
                  </label>
                  {musicUploading && (
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-white/15 px-4 py-2 text-xs text-slate-200"
                      onClick={onCancelLaptopSong}
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  mp3 / m4a / wav / aac / ogg, max {formatMusicBytes(18 * 1024 * 1024)}. You cannot browse the
                  phone’s library from here — pick a file on this laptop. You are responsible for the rights
                  to play it.
                </p>
              </>
            )}
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm text-slate-400">Frame style</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {FRAME_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    void send(
                      "setFrameStyle",
                      { frameStyle: style.id },
                      { frameStyle: style.id, accentColor: style.defaultAccent || snapshot?.accentColor || "#3B82F6" },
                    )
                  }
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left transition disabled:opacity-40",
                    snapshot?.frameStyle === style.id
                      ? "border-blue-400 bg-blue-500/10"
                      : "booth-card border-white/10",
                  )}
                >
                  {style.assetSrc && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={style.assetSrc}
                      alt=""
                      className={cn(
                        "mb-2 h-14 w-full rounded-lg object-cover",
                        style.thumbAlign === "bottom" ? "object-bottom" : "object-center",
                      )}
                    />
                  )}
                  <span className="block font-medium text-white">{style.name}</span>
                </button>
              ))}
            </div>
            {snapshot?.frameStyle && (
              <div className="relative mt-4 hidden aspect-video max-h-40 overflow-hidden rounded-2xl sm:block">
                <div className="h-full w-full bg-slate-800" />
                <FrameOverlay
                  style={getFrameStyle(snapshot.frameStyle).id}
                  names={snapshot.clientNames}
                  accentColor={snapshot.accentColor}
                />
              </div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium text-white">Booth settings</h2>
          <p className="mt-1 text-sm text-slate-400">Same toggles as Settings on the phone. Drive login still happens there.</p>

          <div className="mt-4 grid gap-3">
            <ToggleRow
              title="Slow-mo / time ramp"
              subtitle="On: live preview ramp and baked slow-mo. Off: normal-speed preview and files."
              checked={snapshot?.slowMoEnabled !== false}
              disabled={locked}
              onChange={(slowMoEnabled) => void send("setSlowMo", { slowMoEnabled }, { slowMoEnabled })}
            />
            <ToggleRow
              title="Mute booth music"
              subtitle="Silences looping beds on the booth phone. Guests still hear overlay / mixed files."
              checked={snapshot?.boothMusicMuted === true}
              disabled={locked}
              onChange={(boothMusicMuted) => void send("setBoothMusicMuted", { boothMusicMuted }, { boothMusicMuted })}
            />
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-sm text-slate-400">Video quality</span>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => void send("setVideoQuality", { videoQuality: "high" }, { videoQuality: "high" })}
                className={cn(
                  "flex min-h-[88px] flex-col items-start rounded-2xl border px-4 py-3 text-left disabled:opacity-40",
                  snapshot?.videoQuality !== "standard"
                    ? "border-blue-400/60 bg-blue-500/10"
                    : "booth-card border-white/10",
                )}
              >
                <span className="text-white">High</span>
                <span className="mt-1 text-sm text-slate-400">1920×1080 · ~8 Mbps</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => void send("setVideoQuality", { videoQuality: "standard" }, { videoQuality: "standard" })}
                className={cn(
                  "flex min-h-[88px] flex-col items-start rounded-2xl border px-4 py-3 text-left disabled:opacity-40",
                  snapshot?.videoQuality === "standard"
                    ? "border-blue-400/60 bg-blue-500/10"
                    : "booth-card border-white/10",
                )}
              >
                <span className="text-white">Standard</span>
                <span className="mt-1 text-sm text-slate-400">1280×720 · ~4 Mbps</span>
              </button>
            </div>
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-sm text-slate-400">Cloud destination</span>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => void send("setCloudDestination", { cloudDestination: "blob" }, { cloudDestination: "blob" })}
                className={cn(
                  "min-h-[88px] rounded-2xl border px-4 py-3 text-left disabled:opacity-40",
                  snapshot?.cloudDestination !== "drive"
                    ? "border-blue-400/60 bg-blue-500/10"
                    : "booth-card border-white/10",
                )}
              >
                <span className="block text-white">Vercel Blob</span>
                <span className="mt-1 block text-sm text-slate-400">
                  {snapshot?.blobConfigured
                    ? "Guest QR uploads work on this deploy."
                    : "Temporarily unavailable — use Drive or local download."}
                </span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => void send("setCloudDestination", { cloudDestination: "drive" }, { cloudDestination: "drive" })}
                className={cn(
                  "min-h-[88px] rounded-2xl border px-4 py-3 text-left disabled:opacity-40",
                  snapshot?.cloudDestination === "drive"
                    ? "border-blue-400/60 bg-blue-500/10"
                    : "booth-card border-white/10",
                )}
              >
                <span className="block text-white">Google Drive</span>
                <span className="mt-1 block text-sm text-slate-400">
                  {snapshot?.driveConnected
                    ? "Phone is connected."
                    : snapshot?.driveConfigured
                      ? "OAuth is configured — connect on the phone."
                      : "Set Google env vars, then connect on the phone."}
                </span>
              </button>
            </div>
            {snapshot?.cloudDestination === "drive" && (
              <label className="mt-3 block">
                <span className="mb-2 block text-sm text-slate-400">Drive folder name</span>
                <input
                  defaultValue={snapshot.driveFolderName}
                  key={snapshot.driveFolderName}
                  disabled={locked}
                  onBlur={(e) => {
                    const driveFolderName = e.target.value.trim() || "360show";
                    if (driveFolderName !== snapshot.driveFolderName) {
                      void send(
                        "setCloudDestination",
                        { cloudDestination: "drive", driveFolderName },
                        { driveFolderName },
                      );
                    }
                  }}
                  className="booth-card min-h-12 w-full rounded-2xl border px-4 text-white outline-none focus:border-blue-400"
                />
              </label>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-medium text-white">Phone-only</h2>
          <div className="mt-3 grid gap-2">
            <DisabledReason
              title="Connect Google Drive"
              reason="Drive OAuth uses cookies on the booth browser. Open Settings on the phone to Connect."
            />
            <DisabledReason
              title="Event logo"
              reason="Logo files are stored in IndexedDB on the phone. Change it in Event setup there."
            />
            <DisabledReason
              title="Camera / capture hardware"
              reason="The booth phone stays the camera. Keep Capture open and remote armed."
            />
          </div>
        </section>

        <button
          type="button"
          className="mt-8 self-start text-sm text-slate-500 hover:text-slate-300"
          onClick={() => {
            clearStoredPair(eventId);
            setToken("");
            setView(null);
            window.history.replaceState(null, "", window.location.pathname);
          }}
        >
          Disconnect this laptop
        </button>
      </div>
    </div>
  );
}

function ConnectionChip({ connection }: { connection: "paired" | "waiting" | "offline" }) {
  const label = connection === "paired" ? "Paired" : connection === "waiting" ? "Waiting" : "Offline";
  const color =
    connection === "paired"
      ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
      : connection === "waiting"
        ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
        : "border-white/15 bg-white/5 text-slate-300";
  return (
    <span className={cn("rounded-full border px-4 py-2 text-sm font-medium", color)}>{label}</span>
  );
}

function ToggleRow({
  title,
  subtitle,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="booth-card flex min-h-14 items-center justify-between gap-4 rounded-2xl border px-4 py-3">
      <span>
        <span className="block text-white">{title}</span>
        <span className="block text-sm text-slate-400">{subtitle}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-blue-500"
      />
    </label>
  );
}

function DisabledReason({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 opacity-80">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{reason}</p>
    </div>
  );
}
