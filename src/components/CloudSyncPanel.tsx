"use client";

import { useState } from "react";
import { useBooth } from "@/lib/store";
import { readOwnerKey } from "@/lib/cloud/client";

const LABEL: Record<string, string> = {
  ok: "Synced",
  off: "Not set up on the server (events stay on this device)",
  "needs-key": "Enter the owner key to sync events and settings across devices",
  "bad-key": "Key not accepted — enter the owner key again",
  offline: "Offline — changes stay on this device and sync when back online",
};

/** Booth Settings: one-time owner key entry + cloud event/settings sync status. */
export const RESULT_NOTE = {
  rejected: "Key not accepted",
  off: "Cloud sync isn't set up on the server",
  offline: "Couldn't reach the server — try again when online",
} as const;

export function CloudSyncPanel() {
  const { cloudStatus, cloudSyncedAt, setOwnerKey, syncNow } = useBooth();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const hasKey = typeof window !== "undefined" && Boolean(readOwnerKey());

  async function save(key: string) {
    setBusy(true);
    try {
      const result = await setOwnerKey(key);
      setNote(result === "ok" ? null : RESULT_NOTE[result]);
      if (result === "ok") setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-6 max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-4 text-sm"
      data-testid="cloud-sync"
    >
      <p className="font-semibold text-white">Cloud sync (events + settings)</p>
      <p className="mt-1 text-slate-400" data-testid="cloud-sync-status">
        {LABEL[cloudStatus] || cloudStatus}
        {cloudStatus === "ok" && cloudSyncedAt
          ? ` · ${new Date(cloudSyncedAt).toLocaleTimeString()}`
          : ""}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Clips and song files always stay on this device.
      </p>
      {cloudStatus !== "off" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            aria-label="Owner key"
            placeholder={
              hasKey ? "Owner key saved on this device" : "Owner key"
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
          />
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => void save(draft)}
            className="rounded-xl bg-pink-600 px-3 py-2 text-white disabled:opacity-50"
          >
            Save key
          </button>
          {hasKey && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void syncNow()}
              className="rounded-xl border border-white/15 px-3 py-2 text-white"
            >
              Sync now
            </button>
          )}
          {hasKey && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save("")}
              className="rounded-xl border border-white/15 px-3 py-2 text-slate-300"
            >
              Forget key
            </button>
          )}
        </div>
      )}
      {note && (
        <p className="mt-1 text-xs text-amber-200" data-testid="owner-key-note">
          {note}
        </p>
      )}
    </section>
  );
}
