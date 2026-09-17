"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OperatorShell } from "@/components/OperatorShell";
import { BootScreen } from "@/components/BootScreen";
import { CrowdOpenControls } from "@/components/CrowdOpenControls";
import { FRAME_STYLES } from "@/lib/frames";
import { createId } from "@/lib/ids";
import { capturePath } from "@/lib/shareUrl";
import { useBooth, useEvent } from "@/lib/store";
import { MUSIC_BEDS, CAPTURE_DURATION_SECS, resolveCaptureDurationSec, type BoothEvent } from "@/lib/types";
import { SOFT_MUSIC_BEDS, hasMusicBed, musicBedSrc, normalizeMusicBedLabel } from "@/lib/music/beds";
import { hasCustomMusic, musicCaption, validateCustomMusicFile } from "@/lib/music/custom";
import { nudgeBoothMusic, syncBoothMusic } from "@/lib/music/player";
import { cn } from "@/lib/cn";

export function EventSetupScreen({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const { ready, saveEvent, removeEvent } = useBooth();
  const existing = useEvent(eventId ?? "").event;
  const isNew = !eventId;

  const initial = useMemo<BoothEvent>(() => {
    if (existing) return existing;
    const now = Date.now();
    return {
      id: createId("evt"),
      name: "Tonight's Event",
      date: new Date().toISOString().slice(0, 10),
      clientNames: "",
      accentColor: "#3B82F6",
      logoDataUrl: null,
      musicBedLabel: MUSIC_BEDS[1],
      customMusicBlobId: null,
      customMusicName: null,
      captureDurationSec: 10,
      frameStyle: "gold-oval",
      createdAt: now,
      updatedAt: now,
    };
  }, [existing]);

  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pendingMusic, setPendingMusic] = useState<File | null>(null);
  const [clearCustom, setClearCustom] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setForm(existing);
      setPendingMusic(null);
      setClearCustom(false);
      setMusicError(null);
    }
  }, [existing]);

  useEffect(() => {
    if (!pendingMusic) return;
    const url = URL.createObjectURL(pendingMusic);
    syncBoothMusic({ src: url, playing: true, muted: false });
    nudgeBoothMusic();
    return () => {
      syncBoothMusic({ src: null, playing: false });
      URL.revokeObjectURL(url);
    };
  }, [pendingMusic]);

  useEffect(() => {
    return () => syncBoothMusic({ src: null, playing: false });
  }, []);

  if (!ready) return <BootScreen />;
  if (eventId && !existing) {
    return (
      <div className="p-10 text-slate-300">Event not found. Go back to the list.</div>
    );
  }

  function update<K extends keyof BoothEvent>(key: K, value: BoothEvent[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function onLogo(file: File | null) {
    if (!file) {
      update("logoDataUrl", null);
      return;
    }
    if (file.size > 1_200_000) {
      alert("Please choose a logo under 1.2MB.");
      return;
    }
    const data = await fileToDataUrl(file);
    update("logoDataUrl", data);
  }

  async function onMusicFile(file: File | null) {
    if (!file) return;
    const error = validateCustomMusicFile(file);
    if (error) {
      setMusicError(error);
      return;
    }
    setMusicError(null);
    setClearCustom(false);
    setPendingMusic(file);
    setSaved(false);
  }

  function onClearCustomSong() {
    setPendingMusic(null);
    setClearCustom(true);
    setMusicError(null);
    setSaved(false);
    const bed = normalizeMusicBedLabel(form.musicBedLabel);
    syncBoothMusic({
      src: musicBedSrc(bed),
      playing: hasMusicBed(bed),
      muted: false,
    });
    if (hasMusicBed(bed)) nudgeBoothMusic();
  }

  async function persist(andOpen: boolean) {
    const next = {
      ...form,
      updatedAt: Date.now(),
      clientNames: form.clientNames.trim() || "Guests",
      musicBedLabel: normalizeMusicBedLabel(form.musicBedLabel),
      captureDurationSec: resolveCaptureDurationSec(form.captureDurationSec),
    };
    syncBoothMusic({ src: null, playing: false });
    const music =
      pendingMusic ? { file: pendingMusic } : clearCustom ? { clear: true as const } : undefined;
    await saveEvent(next, true, music);
    setPendingMusic(null);
    setClearCustom(false);
    setSaved(true);
    if (andOpen) router.push(capturePath(next.id));
    else if (isNew) router.replace(`/e/${next.id}`);
  }

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-white">{isNew ? "New event" : "Event setup"}</h1>
          <p className="mt-1 text-slate-400">Branding used on capture, frames, and guest share.</p>
        </div>
        {!isNew && (
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-red-300"
            onClick={async () => {
              if (confirm("Delete this event and its clips from this tablet?")) {
                await removeEvent(form.id);
                router.push("/");
              }
            }}
          >
            Delete
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Field label="Event name">
          <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Couple / client names">
          <input
            value={form.clientNames}
            onChange={(e) => update("clientNames", e.target.value)}
            placeholder="e.g. Maya & Jordan"
            className={inputClass}
          />
        </Field>
        <Field label="Date">
          <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} className={inputClass} />
        </Field>
        <div>
          <span className="mb-2 block text-sm text-slate-400">Spin length</span>
          <div className="grid grid-cols-3 gap-2">
            {CAPTURE_DURATION_SECS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => update("captureDurationSec", sec)}
                className={cn(
                  "min-h-12 rounded-2xl border text-base font-medium",
                  resolveCaptureDurationSec(form.captureDurationSec) === sec
                    ? "border-blue-400 bg-blue-500/10 text-white"
                    : "booth-card border-white/10 text-slate-200",
                )}
              >
                {sec}s
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            How long START SPIN records. Existing events default to 10s.
          </span>
        </div>
        <Field label="Accent color">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.accentColor}
              onChange={(e) => update("accentColor", e.target.value)}
              className="h-12 w-16 cursor-pointer rounded-xl border border-white/10 bg-transparent"
            />
            <input value={form.accentColor} onChange={(e) => update("accentColor", e.target.value)} className={inputClass} />
          </div>
        </Field>
        <div>
          <span className="mb-2 block text-sm text-slate-400">Music bed</span>
          <select
            value={normalizeMusicBedLabel(form.musicBedLabel)}
            onChange={(e) => {
              const next = e.target.value;
              update("musicBedLabel", next);
              if (pendingMusic || (!clearCustom && hasCustomMusic(form))) return;
              syncBoothMusic({
                src: musicBedSrc(next),
                playing: hasMusicBed(next),
                muted: false,
              });
              nudgeBoothMusic();
            }}
            className={inputClass}
          >
            {MUSIC_BEDS.map((bed) => (
              <option key={bed} value={bed}>
                {bed}
              </option>
            ))}
          </select>
          <label className="relative mt-3 flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl border border-blue-400/40 bg-blue-500/15 px-4 text-center text-sm font-medium text-white">
            Use song from this phone
            <input
              type="file"
              accept="audio/*,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg,.flac"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onMusicFile(file);
              }}
            />
          </label>
          {(pendingMusic || (!clearCustom && (form.customMusicName || form.customMusicBlobId))) && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="min-w-0 text-sm text-slate-200">
                <span className="block truncate font-medium text-white">
                  {musicCaption(
                    pendingMusic
                      ? { customMusicName: pendingMusic.name, customMusicBlobId: "pending" }
                      : form,
                    "",
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Plays instead of the bed on this tablet. Not uploaded to Blob/Drive except inside
                  a mixed video.
                </span>
              </p>
              <button
                type="button"
                className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200"
                onClick={onClearCustomSong}
              >
                Clear custom song
              </button>
            </div>
          )}
          {musicError && <p className="mt-2 text-sm text-red-300">{musicError}</p>}
          <span className="mt-2 block text-xs text-slate-500">
            Built-in beds loop under spin, preview, and guest share, and mix into Download / Share
            when this browser can record audio. A song from this phone wins over the bed until you
            clear it (mp3/m4a/wav/aac/ogg, max 18 MB). Softer beds ({SOFT_MUSIC_BEDS.join(", ")})
            suit Christian Fellowship and gentle events.
          </span>
        </div>
        <Field label="Logo (stored locally)">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => void onLogo(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-blue-500 file:px-4 file:py-2 file:text-white"
          />
          {form.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logoDataUrl} alt="Logo" className="mt-3 h-14 w-auto rounded-lg border border-white/10" />
          )}
        </Field>
      </div>

      <Field label="Frame style" className="mt-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {FRAME_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => {
                update("frameStyle", style.id);
                if (style.defaultAccent) update("accentColor", style.defaultAccent);
              }}
              className={cn(
                "rounded-2xl border px-3 py-4 text-left transition",
                form.frameStyle === style.id
                  ? "border-blue-400 bg-blue-500/10"
                  : "booth-card border-white/10",
              )}
            >
              {style.assetSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={style.assetSrc}
                  alt=""
                  className="mb-3 h-16 w-full rounded-lg object-cover object-bottom"
                />
              )}
              <span className="block font-medium text-white">{style.name}</span>
              <span className="mt-1 block text-xs text-slate-400">{style.description}</span>
            </button>
          ))}
        </div>
      </Field>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void persist(false)}
          className="min-h-12 rounded-full border border-white/15 px-6 font-medium text-white"
        >
          {saved ? "Saved" : "Save event"}
        </button>
        <button
          type="button"
          onClick={() => void persist(true)}
          className="min-h-12 rounded-full bg-blue-500 px-6 font-medium text-white"
        >
          Save & start spinning
        </button>
        {!isNew && <CrowdOpenControls eventId={form.id} />}
      </div>
    </div>
  );

  if (isNew) {
    return (
      <div className="booth-page p-3 sm:p-5">
        <div className="booth-frame mx-auto max-w-5xl rounded-[28px] p-6 sm:p-10">{body}</div>
      </div>
    );
  }

  return <OperatorShell eventId={form.id}>{body}</OperatorShell>;
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-2 block text-sm text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "booth-card min-h-12 w-full rounded-2xl border px-4 text-white outline-none focus:border-blue-400";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
