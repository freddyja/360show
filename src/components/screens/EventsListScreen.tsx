"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Sparkles } from "lucide-react";
import { BootScreen } from "@/components/BootScreen";
import { useBooth } from "@/lib/store";
import { capturePath } from "@/lib/shareUrl";

export function EventsListScreen() {
  const router = useRouter();
  const { ready, events, setActive } = useBooth();

  if (!ready) return <BootScreen />;

  return (
    <div className="min-h-dvh bg-[#05080f] p-3 sm:p-4 md:p-5">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-[1400px] flex-col rounded-[28px] border border-white/10 bg-[#0a101c] p-6 sm:p-10 md:min-h-[calc(100dvh-2.5rem)]">
        <p className="text-sm tracking-[0.28em] text-slate-400 uppercase">360show</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Tonight’s events</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          Pick a booth event, then start spinning. Everything stays on this tablet until you deploy a
          public share host.
        </p>

        <div className="mt-8 grid gap-4">
          {events.map((event) => (
            <article
              key={event.id}
              className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#0c1424] p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${event.accentColor}22`, color: event.accentColor }}
                >
                  <CalendarDays className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-medium text-white">{event.clientNames}</h2>
                    {event.isSample && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/30 px-2 py-0.5 text-xs text-blue-200">
                        <Sparkles className="h-3 w-3" /> Sample
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400">
                    {event.name} · {event.date} · {event.frameStyle.replace("-", " ")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/e/${event.id}`}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200"
                >
                  Setup
                </Link>
                <button
                  type="button"
                  className="rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white"
                  onClick={async () => {
                    await setActive(event.id);
                    router.push(capturePath(event.id));
                  }}
                >
                  Open booth
                </button>
              </div>
            </article>
          ))}
        </div>

        <Link
          href="/events/new"
          className="mt-6 flex min-h-[72px] items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-400/40 text-blue-200"
        >
          <Plus className="h-5 w-5" />
          Create event
        </Link>
      </div>
    </div>
  );
}
