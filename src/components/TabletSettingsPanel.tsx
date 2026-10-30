"use client";

import { BUILD_ID, shortBuildId } from "@/lib/version";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import type {
  RemoteCameraFacing,
  RemoteCommandPayload,
  RemoteCommandType,
  RemoteEventSnapshot,
} from "@/lib/remote/types";

/**
 * Session settings picker for the tablet remote. Choices come from the phone's
 * snapshot.options (never hard-coded here); changes go through the same
 * command queue as START/STOP and are applied on the phone.
 */
type SettingKey =
  | "frameStyle"
  | "musicBedLabel"
  | "captureDurationSec"
  | "videoQuality"
  | "slowMoEnabled"
  | "boothMusicMuted";

const COMMAND_FOR: Record<SettingKey, RemoteCommandType> = {
  frameStyle: "setFrameStyle",
  musicBedLabel: "setMusicBed",
  captureDurationSec: "setSpinLength",
  videoQuality: "setVideoQuality",
  slowMoEnabled: "setSlowMo",
  boothMusicMuted: "setBoothMusicMuted",
};

export function TabletSettingsPanel({
  snapshot,
  locked,
  lockReason,
  onSend,
}: {
  snapshot: RemoteEventSnapshot | null | undefined;
  locked: boolean;
  lockReason: string;
  onSend: (
    type: RemoteCommandType,
    payload: RemoteCommandPayload,
  ) => Promise<boolean>;
}) {
  // Optimistic value per setting until the phone's snapshot confirms it.
  const [pending, setPending] = useState<
    Partial<Record<SettingKey, string | number | boolean>>
  >({});

  const [pendingCamera, setPendingCamera] = useState<RemoteCameraFacing | null>(
    null,
  );
  const reportedCamera = snapshot?.camera?.facing;
  useEffect(() => {
    if (reportedCamera && reportedCamera === pendingCamera)
      setPendingCamera(null);
  }, [reportedCamera, pendingCamera]);

  useEffect(() => {
    if (!snapshot) return;
    setPending((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(prev) as SettingKey[]) {
        if (snapshot[key] === prev[key]) delete next[key];
      }
      return next;
    });
  }, [snapshot]);

  const options = snapshot?.options;
  if (!snapshot || !options) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
        Settings appear once the booth phone reports in (update the phone to
        this version if they never do).
      </section>
    );
  }

  const value = <K extends SettingKey>(key: K) =>
    key in pending ? pending[key] : snapshot[key];

  async function change(key: SettingKey, next: string | number | boolean) {
    if (locked || value(key) === next) return;
    setPending((p) => ({ ...p, [key]: next }));
    const ok = await onSend(COMMAND_FOR[key], {
      [key]: next,
    } as RemoteCommandPayload);
    if (!ok) {
      setPending((p) => {
        const copy = { ...p };
        delete copy[key];
        return copy;
      });
    }
  }

  async function changeCamera(next: RemoteCameraFacing) {
    const current = pendingCamera ?? snapshot?.camera?.facing;
    if (locked || current === next) return;
    setPendingCamera(next);
    const ok = await onSend("setCameraFacing", { cameraFacing: next });
    if (!ok) setPendingCamera(null);
  }

  const chip = (active: boolean, waiting: boolean) =>
    cn(
      "min-h-14 rounded-2xl border px-4 text-lg font-semibold transition active:scale-[0.98] disabled:opacity-40",
      active
        ? "border-cyan-300 bg-cyan-400/25 text-white"
        : "border-white/15 bg-black/30 text-slate-200",
      waiting && "animate-pulse",
    );

  const Row = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );

  return (
    <section
      className={cn(
        "space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4",
        locked && "opacity-60",
      )}
      aria-label="Booth settings"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">Next spin settings</p>
          <p className="text-xs text-slate-500" data-testid="app-version">
            Tablet {shortBuildId(BUILD_ID)} · Booth{" "}
            {shortBuildId(snapshot.buildId) === "unknown"
              ? "older build"
              : shortBuildId(snapshot.buildId)}
            {snapshot.buildId && snapshot.buildId !== BUILD_ID
              ? " · versions differ (each updates when idle)"
              : ""}
          </p>
        </div>
        {locked && (
          <p className="flex items-center gap-1 text-sm text-amber-200">
            <Lock className="h-4 w-4" /> {lockReason}
          </p>
        )}
      </div>

      <Row label="Look pack / frame">
        {options.frames.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={locked}
            className={chip(
              value("frameStyle") === f.id,
              pending.frameStyle === f.id,
            )}
            onClick={() => void change("frameStyle", f.id)}
          >
            {f.name}
          </button>
        ))}
      </Row>

      <Row
        label={
          snapshot.usingCustomMusic
            ? `Music (custom: ${snapshot.customMusicName || "song"})`
            : "Music track"
        }
      >
        {options.musicBeds.map((m) => (
          <button
            key={m}
            type="button"
            disabled={locked}
            className={chip(
              !snapshot.usingCustomMusic && value("musicBedLabel") === m,
              pending.musicBedLabel === m,
            )}
            onClick={() => void change("musicBedLabel", m)}
          >
            {m}
          </button>
        ))}
      </Row>

      <div className="grid gap-4 sm:grid-cols-2">
        <Row label="Spin length">
          {options.spinLengths.map((s) => (
            <button
              key={s}
              type="button"
              disabled={locked}
              className={chip(
                value("captureDurationSec") === s,
                pending.captureDurationSec === s,
              )}
              onClick={() => void change("captureDurationSec", s)}
            >
              {s}s
            </button>
          ))}
        </Row>
        <Row label="Video quality">
          {options.videoQualities.map((q) => (
            <button
              key={q}
              type="button"
              disabled={locked}
              className={chip(
                value("videoQuality") === q,
                pending.videoQuality === q,
              )}
              onClick={() => void change("videoQuality", q)}
            >
              {q === "high" ? "High 1080p" : "Standard 720p"}
            </button>
          ))}
        </Row>
        <Row label="Slow-mo ramp">
          {[true, false].map((on) => (
            <button
              key={String(on)}
              type="button"
              disabled={locked}
              className={chip(
                value("slowMoEnabled") === on,
                pending.slowMoEnabled === on,
              )}
              onClick={() => void change("slowMoEnabled", on)}
            >
              {on ? "On" : "Off"}
            </button>
          ))}
        </Row>
        {snapshot.camera && (
          <Row label="Booth camera">
            {(["user", "environment"] as const).map((f) => {
              const cam = snapshot.camera!;
              const known = f === "user" ? cam.front : cam.back;
              const current = (pendingCamera ?? cam.facing) === f;
              return (
                <button
                  key={f}
                  type="button"
                  disabled={locked || (known === false && !current)}
                  title={
                    known === false
                      ? "Not available on the booth phone"
                      : undefined
                  }
                  className={chip(current, pendingCamera === f)}
                  onClick={() => void changeCamera(f)}
                >
                  {f === "user" ? "Front" : "Back"}
                  {known === false ? " (n/a)" : ""}
                </button>
              );
            })}
            {snapshot.camera.note && (
              <p className="w-full text-sm text-amber-200">
                {snapshot.camera.note}
              </p>
            )}
          </Row>
        )}
        <Row label="Booth speaker">
          {[false, true].map((muted) => (
            <button
              key={String(muted)}
              type="button"
              disabled={locked}
              className={chip(
                value("boothMusicMuted") === muted,
                pending.boothMusicMuted === muted,
              )}
              onClick={() => void change("boothMusicMuted", muted)}
            >
              {muted ? "Muted" : "Music on"}
            </button>
          ))}
        </Row>
      </div>
      <p className="text-xs text-slate-500">
        Countdown: {options.countdownSec}s (fixed on the booth).
      </p>
    </section>
  );
}
