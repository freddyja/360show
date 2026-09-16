"use client";

import Link from "next/link";
import { BootScreen } from "@/components/BootScreen";
import { OperatorShell } from "@/components/OperatorShell";
import { useBooth } from "@/lib/store";

export function SettingsScreen({ eventId }: { eventId: string }) {
  const { ready, settings, saveSettings, resetAll, events, clips } = useBooth();

  if (!ready) return <BootScreen />;

  return (
    <OperatorShell eventId={eventId}>
      <h1 className="text-3xl font-semibold text-white">Settings</h1>
      <p className="mt-1 text-slate-400">This tablet’s booth identity. No cloud account required.</p>

      <div className="mt-8 grid max-w-2xl gap-6">
        <label className="block">
          <span className="mb-2 block text-sm text-slate-400">Device name</span>
          <input
            className="min-h-12 w-full rounded-2xl border border-white/10 bg-[#0c1424] px-4 text-white"
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

        <label className="flex min-h-14 items-center justify-between rounded-2xl border border-white/10 bg-[#0c1424] px-4">
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

      <section className="mt-10 max-w-2xl rounded-3xl border border-white/10 bg-[#0c1424] p-5">
        <h2 className="text-lg font-medium text-white">About 360show</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Operator MVP for a 360 photo booth. Camera capture and live playback-rate ramping are real
          in the browser. Download, Save, and guest cloud clips bake that ramp into the file. Platform
          motor and GoPro control are stubbed. Guest QR links use the public site origin; clips upload
          to Vercel Blob when <code>BLOB_READ_WRITE_TOKEN</code> is set.
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
