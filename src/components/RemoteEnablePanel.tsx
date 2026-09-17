"use client";

import { useState } from "react";
import { Copy, Radio, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/cn";
import { operatorIsFresh, type RemotePublicView } from "@/lib/remote/types";

export function RemoteEnablePanel({
  enabled,
  remoteUrl,
  pairCode,
  view,
  error,
  busy,
  available = false,
  unavailableReason = null,
  onEnable,
  onDisable,
}: {
  enabled: boolean;
  remoteUrl: string | null;
  pairCode: string | null;
  view: RemotePublicView | null;
  error: string | null;
  busy?: boolean;
  available?: boolean;
  unavailableReason?: string | null;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const laptop = view ? operatorIsFresh(view) : false;
  const status = !enabled ? "off" : error ? "error" : laptop ? "paired" : "waiting";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <Radio className="h-4 w-4 text-cyan-300" />
            Remote operator
          </p>
          <p className="mt-1 max-w-xl text-xs text-slate-400">
            Pair a laptop over HTTPS to START SPIN and change look, music, and booth settings. The
            phone stays the camera.
          </p>
        </div>
        {enabled ? (
          <button
            type="button"
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200"
            onClick={onDisable}
          >
            Disable remote
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !available}
            className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
            onClick={onEnable}
          >
            Enable remote control
          </button>
        )}
      </div>

      {!available && !enabled && (
        <p className="mt-3 text-sm text-amber-200">
          {unavailableReason ||
            "Laptop remote is paused while Vercel Blob is unavailable. Use this phone for capture, look, and songs."}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {enabled && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
          {remoteUrl && (
            <div className="mx-auto w-fit rounded-2xl bg-white p-2">
              <QRCodeSVG value={remoteUrl} size={148} bgColor="#ffffff" fgColor="#07101c" />
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Pair status</p>
            <p
              className={cn(
                "mt-1 text-lg font-medium",
                status === "paired" && "text-emerald-300",
                status === "waiting" && "text-amber-200",
                status === "error" && "text-red-300",
              )}
            >
              {status === "paired" && "Paired — laptop connected"}
              {status === "waiting" && "Waiting for laptop"}
              {status === "error" && "Remote channel error"}
            </p>
            {pairCode && (
              <p className="mt-3 font-mono text-3xl tracking-[0.35em] text-white">{pairCode}</p>
            )}
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-400">
              <Smartphone className="h-4 w-4" />
              Laptop opens this link (or types the code on `/remote` for this event).
            </p>
            {remoteUrl && (
              <button
                type="button"
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-3 text-sm text-slate-200"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(remoteUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  } catch {
                    window.prompt("Copy remote operator link", remoteUrl);
                  }
                }}
              >
                <Copy className="h-4 w-4" />
                {copied ? "Copied" : "Copy laptop link"}
              </button>
            )}
            {remoteUrl && (
              <p className="mt-2 break-all text-xs text-slate-500">{remoteUrl}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
