"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cloud, HardDrive } from "lucide-react";
import { BootScreen } from "@/components/BootScreen";
import { OperatorShell } from "@/components/OperatorShell";
import { useBooth } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { CloudDestination } from "@/lib/types";
import { fetchShareConfig } from "@/lib/share/publish";
import type { ShareConfig } from "@/lib/share/types";

export function SettingsScreen({ eventId }: { eventId: string }) {
  const { ready, settings, saveSettings, resetAll, events, clips } = useBooth();
  const [config, setConfig] = useState<ShareConfig | null>(null);
  const [driveBanner, setDriveBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("drive") === "connected") setDriveBanner("Google Drive connected for this tablet.");
    if (q.get("drive") === "error") {
      setDriveBanner(q.get("reason") || "Google Drive connect failed.");
    }
    let cancelled = false;
    (async () => {
      const next = await fetchShareConfig();
      if (cancelled) return;
      try {
        const statusRes = await fetch("/api/drive/status", { cache: "no-store" });
        const status = (await statusRes.json()) as { connected?: boolean; email?: string | null };
        if (cancelled) return;
        setConfig({
          ...next,
          driveConnected: Boolean(status.connected),
          driveEmail: status.email ?? null,
        });
      } catch {
        if (!cancelled) setConfig(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <BootScreen />;

  const destination = settings.cloudDestination || "blob";

  async function setDestination(next: CloudDestination) {
    await saveSettings({ ...settings, cloudDestination: next });
  }

  async function disconnectDrive() {
    setBusy(true);
    try {
      await fetch("/api/drive/disconnect", { method: "POST" });
      const next = await fetchShareConfig();
      setConfig(next);
      setDriveBanner("Google Drive disconnected on this tablet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OperatorShell eventId={eventId}>
      <h1 className="text-3xl font-semibold text-white">Settings</h1>
      <p className="mt-1 text-slate-400">This tablet’s booth identity. Cloud sharing is optional.</p>

      <div className="mt-8 grid max-w-2xl gap-6">
        <label className="block">
          <span className="mb-2 block text-sm text-slate-400">Device name</span>
          <input
            className="booth-card min-h-12 w-full rounded-2xl border px-4 text-white"
            value={settings.deviceName}
            onChange={(e) => saveSettings({ ...settings, deviceName: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-slate-400">
            Mock battery {settings.mockBatteryPct}%
          </span>
          <input
            type="range"
            min={1}
            max={100}
            value={settings.mockBatteryPct}
            onChange={(e) => saveSettings({ ...settings, mockBatteryPct: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </label>

        <label className="booth-card flex min-h-14 items-center justify-between rounded-2xl border px-4">
          <span>
            <span className="block text-white">Slow-mo / time ramp</span>
            <span className="block text-sm text-slate-400">
              On: live preview ramp and baked slow-mo downloads. Off: normal-speed preview and files.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.slowMoEnabled !== false}
            onChange={(e) => saveSettings({ ...settings, slowMoEnabled: e.target.checked })}
            className="h-5 w-5 accent-blue-500"
          />
        </label>

        <label className="booth-card flex min-h-14 items-center justify-between rounded-2xl border px-4">
          <span>
            <span className="block text-white">Mute booth music</span>
            <span className="block text-sm text-slate-400">
              Silences looping beds on this operator tablet. Guests still hear overlay playback; mixed
              Download / Share files keep their audio.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.boothMusicMuted === true}
            onChange={(e) => saveSettings({ ...settings, boothMusicMuted: e.target.checked })}
            className="h-5 w-5 accent-blue-500"
          />
        </label>

        <div>
          <span className="mb-2 block text-sm text-slate-400">Video quality</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void saveSettings({ ...settings, videoQuality: "high" })}
              className={cn(
                "flex min-h-[88px] flex-col items-start rounded-2xl border px-4 py-3 text-left",
                settings.videoQuality !== "standard"
                  ? "border-blue-400/60 bg-blue-500/10"
                  : "booth-card border-white/10",
              )}
            >
              <span className="text-white">High</span>
              <span className="mt-1 text-sm text-slate-400">1920×1080 · ~8 Mbps. Best for Fold / tablet cameras.</span>
            </button>
            <button
              type="button"
              onClick={() => void saveSettings({ ...settings, videoQuality: "standard" })}
              className={cn(
                "flex min-h-[88px] flex-col items-start rounded-2xl border px-4 py-3 text-left",
                settings.videoQuality === "standard"
                  ? "border-blue-400/60 bg-blue-500/10"
                  : "booth-card border-white/10",
              )}
            >
              <span className="text-white">Standard</span>
              <span className="mt-1 text-sm text-slate-400">1280×720 · ~4 Mbps. Smaller files.</span>
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Browser cameras cannot use the full sensor (a Fold 7 still tops out around 1080p here). High
            clips are larger — Vercel Hobby Blob is 1 GB.
          </p>
        </div>

        <label className="booth-card flex min-h-14 items-center justify-between rounded-2xl border px-4">
          <span>
            <span className="block text-white">Force offline</span>
            <span className="block text-sm text-slate-400">Shows the Offline mode chip; clips stay on-device</span>
          </span>
          <input
            type="checkbox"
            checked={settings.forceOffline}
            onChange={(e) => saveSettings({ ...settings, forceOffline: e.target.checked })}
            className="h-5 w-5 accent-blue-500"
          />
        </label>
      </div>

      <section className="booth-card mt-10 max-w-2xl rounded-3xl border p-5">
        <h2 className="text-lg font-medium text-white">Cloud destination</h2>
        <p className="mt-1 text-sm text-slate-400">
          Where Share uploads guest clips. Preview always stays on this tablet.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void setDestination("blob")}
            className={cn(
              "flex min-h-[96px] items-start gap-3 rounded-2xl border px-4 py-3 text-left",
              destination === "blob"
                ? "border-blue-400/60 bg-blue-500/10"
                : "booth-card border-white/10",
            )}
          >
            <Cloud className="mt-0.5 h-6 w-6 shrink-0 text-blue-400" />
            <span>
              <span className="block text-white">Vercel Blob</span>
              <span className="mt-1 block text-sm text-slate-400">
                Default. Public or private Blob store. Needs BLOB_READ_WRITE_TOKEN.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => void setDestination("drive")}
            className={cn(
              "flex min-h-[96px] items-start gap-3 rounded-2xl border px-4 py-3 text-left",
              destination === "drive"
                ? "border-blue-400/60 bg-blue-500/10"
                : "booth-card border-white/10",
            )}
          >
            <HardDrive className="mt-0.5 h-6 w-6 shrink-0 text-blue-400" />
            <span>
              <span className="block text-white">Google Drive</span>
              <span className="mt-1 block text-sm text-slate-400">
                Anyone-with-link files in your Drive. Connect this tablet.
              </span>
            </span>
          </button>
        </div>

        {destination === "blob" && (
          <p className="mt-4 text-sm text-slate-400">
            {config?.blobConfigured
              ? config.blobAccess
                ? `Blob token is set (${config.blobAccess} store). Share uploads clips to Vercel Blob.`
                : "Blob token is set. Share will upload clips to Vercel Blob."
              : config?.blobTokenPresent || config?.blobUnavailableReason
                ? config.blobUnavailableReason ||
                  "Vercel Blob is temporarily unavailable (store suspended or over Hobby limits). Booth capture still works; guest cloud share via Blob is paused. Download stays on this tablet."
                : "Blob is not configured on this deploy. Local preview still works; guest phones need a token or Drive."}
          </p>
        )}

        {destination === "drive" && (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-400">Drive folder name</span>
              <input
                className="booth-card min-h-12 w-full rounded-2xl border px-4 text-white"
                value={settings.driveFolderName}
                onChange={(e) => saveSettings({ ...settings, driveFolderName: e.target.value || "360show" })}
                placeholder="360show"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Clips land in this folder, with a subfolder per event (anyone with the link can view).
              </span>
            </label>
            {driveBanner && <p className="text-sm text-blue-200">{driveBanner}</p>}
            <p className="text-sm text-slate-400">
              {config?.driveConfigured
                ? config.driveConnected
                  ? `Connected${config.driveEmail ? ` as ${config.driveEmail}` : " on this tablet"}.`
                  : "OAuth is configured. Connect this booth tablet to upload."
                : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Vercel, then Connect."}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/drive/connect?return=${encodeURIComponent(`/e/${eventId}/settings`)}`}
                className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white"
              >
                {config?.driveConnected ? "Reconnect Google Drive" : "Connect Google Drive"}
              </a>
              {config?.driveConnected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnectDrive()}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="booth-card mt-10 max-w-2xl rounded-3xl border p-5">
        <h2 className="text-lg font-medium text-white">About 360show</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Operator MVP for a 360 photo booth. Camera capture is real in the browser. Video quality
          (Settings) requests 1080p high or 720p standard. Slow-mo can be toggled: on uses a live
          playback-rate ramp and bakes it into Download / Share files; off keeps normal speed. Event
          music beds loop under spin / preview / share; a song from this phone can replace the bed
          and mix into exports when the browser allows. Share can upload to Vercel Blob or Google
          Drive. Platform motor and GoPro control are stubbed.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          {events.length} event{events.length === 1 ? "" : "s"} · {clips.length} clip{clips.length === 1 ? "" : "s"} on this tablet
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">
            All events
          </Link>
          <button
            type="button"
            className="rounded-full border border-red-400/30 px-4 py-2 text-sm text-red-200"
            onClick={async () => {
              if (confirm("Reset local data and restore the Maya & Jordan sample event?")) {
                await resetAll();
              }
            }}
          >
            Reset local demo data
          </button>
        </div>
      </section>
    </OperatorShell>
  );
}
