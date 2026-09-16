"use client";

import { useState } from "react";
import { Download, Link2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";

export function ShareActions({
  url,
  onDownload,
  canDownload,
  downloadSubtitle,
}: {
  url: string;
  onDownload: () => void;
  canDownload: boolean;
  downloadSubtitle?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const sms = `sms:?&body=${encodeURIComponent(`Your 360 spin is ready: ${url}`)}`;

  const items = [
    {
      key: "copy",
      icon: Link2,
      title: copied ? "Link copied" : "Share link",
      subtitle: "Copy link to send",
      onClick: copy,
    },
    {
      key: "sms",
      icon: MessageSquare,
      title: "Text me the video",
      subtitle: "Get it on your phone",
      href: sms,
    },
    {
      key: "save",
      icon: Download,
      title: "Save to gallery",
      subtitle: canDownload ? downloadSubtitle || "Download to this device" : "Demo file only",
      onClick: onDownload,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        const className = cn(
          "flex min-h-[84px] items-center gap-4 rounded-2xl border border-white/10 bg-[#0c1424] px-5 text-left transition hover:border-blue-400/40 hover:bg-[#101a2e]",
        );
        const inner = (
          <>
            <Icon className="h-7 w-7 shrink-0 text-blue-400" strokeWidth={1.75} />
            <span>
              <span className="block text-lg font-medium text-white">{item.title}</span>
              <span className="block text-sm text-slate-400">{item.subtitle}</span>
            </span>
          </>
        );
        if (item.href) {
          return (
            <a key={item.key} href={item.href} className={className}>
              {inner}
            </a>
          );
        }
        return (
          <button key={item.key} type="button" onClick={item.onClick} className={className}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
