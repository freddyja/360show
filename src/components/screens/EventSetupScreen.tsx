"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OperatorShell } from "@/components/OperatorShell";
import { BootScreen } from "@/components/BootScreen";
import { FRAME_STYLES } from "@/lib/frames";
import { createId } from "@/lib/ids";
import { capturePath } from "@/lib/shareUrl";
import { useBooth, useEvent } from "@/lib/store";
import { MUSIC_BEDS, type BoothEvent } from "@/lib/types";
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
      frameStyle: "gold-oval",
      createdAt: now,
      updatedAt: now,
    };
  }, [existing]);

  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) setForm(existing);
  }, [existing]);

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

  async function persist(andOpen: boolean) {
    const next = { ...form, updatedAt: Date.now(), clientNames: form.clientNames.trim() || "Guests" };
    await saveEvent(next, true);
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
        <Field label="Music bed (label only in MVP)">
          <select
            value={form.musicBedLabel}
            onChange={(e) => update("musicBedLabel", e.target.value)}
            className={inputClass}
          >
            {MUSIC_BEDS.map((bed) => (
              <option key={bed} value={bed}>
                {bed}
              </option>
            ))}
          </select>
        </Field>
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
                  : "border-white/10 bg-[#0c1424]",
              )}
            >
              {style.assetSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={style.assetSrc}
                  alt=""
                  className="mb-3 h-16 w-full rounded-lg object-cover"
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
      </div>
    </div>
  );

  if (isNew) {
    return (
      <div className="min-h-dvh bg-[#05080f] p-3 sm:p-5">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-white/10 bg-[#0a101c] p-6 sm:p-10">{body}</div>
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
  "min-h-12 w-full rounded-2xl border border-white/10 bg-[#0c1424] px-4 text-white outline-none focus:border-blue-400";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
