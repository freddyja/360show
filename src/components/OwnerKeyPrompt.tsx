"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useBooth } from "@/lib/store";
import { isUpdateBlocked, onBlockersChange } from "@/lib/version";
import { RESULT_NOTE } from "@/components/CloudSyncPanel";

const SNOOZE = "360show:ownerKeySnoozed";

/**
 * Booth-only sheet asking for the owner key when the server has cloud sync on
 * (401) and this device has no key or its key was rejected. Never while a
 * spin, bake or upload is running (same blockers as auto-update). Not now =
 * snoozed for this browser session; sync stays local-only.
 */
export function OwnerKeyPrompt() {
  const { ready, cloudStatus, setOwnerKey } = useBooth();
  const pathname = usePathname() || "";
  const [blocked, setBlocked] = useState(false);
  const [snoozed, setSnoozed] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSnoozed(sessionStorage.getItem(SNOOZE) === "1");
    } catch {
      setSnoozed(false);
    }
    setBlocked(isUpdateBlocked());
    return onBlockersChange(() => setBlocked(isUpdateBlocked()));
  }, []);

  const guestOrTv = pathname.startsWith("/s/") || pathname.includes("/crowd");
  const wanted = cloudStatus === "needs-key" || cloudStatus === "bad-key";
  if (!ready || !wanted || snoozed || blocked || guestOrTv) return null;

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const result = await setOwnerKey(draft);
      if (result !== "ok") setNote(RESULT_NOTE[result]);
      else setDraft("");
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    try {
      sessionStorage.setItem(SNOOZE, "1");
    } catch {}
    setSnoozed(true);
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-4"
      role="dialog"
      aria-label="Owner key"
      data-testid="owner-key-prompt"
    >
      <div className="mx-auto max-w-md rounded-3xl border border-white/15 bg-slate-900/95 p-4 text-sm shadow-2xl backdrop-blur">
        <p className="font-semibold text-white">Sync events across devices</p>
        <p className="mt-1 text-slate-400">
          {cloudStatus === "bad-key" || note === RESULT_NOTE.rejected
            ? "Key not accepted. Enter the owner key again."
            : "Enter the owner key once on this device to sync events and settings."}
        </p>
        {note && note !== RESULT_NOTE.rejected && (
          <p className="mt-1 text-amber-200">{note}</p>
        )}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Owner key"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-xl bg-pink-600 px-3 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Checking…" : "Save"}
          </button>
          <button
            type="button"
            onClick={notNow}
            className="rounded-xl border border-white/15 px-3 py-2 text-slate-300"
          >
            Not now
          </button>
        </form>
      </div>
    </div>
  );
}
