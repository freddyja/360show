"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function QRCard({ url, accentColor }: { url: string; accentColor: string }) {
  const [value, setValue] = useState(url);

  useEffect(() => {
    setValue(url);
  }, [url]);

  return (
    <div className="flex h-full flex-col items-center justify-center rounded-[24px] border booth-card p-6 text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Scan to download</h2>
      <p className="mt-2 text-slate-300">Your 360 video is ready!</p>
      <div className="mt-6 rounded-3xl border-4 bg-white p-3 shadow-[0_0_40px_rgba(59,130,246,0.25)]" style={{ borderColor: accentColor }}>
        <QRCodeSVG value={value} size={220} bgColor="#ffffff" fgColor="#07101c" />
      </div>
      <div className="mt-5 h-1.5 w-1.5 rounded-full bg-blue-500" />
      <p className="mt-4 text-sm text-slate-400">Or choose a quick option below</p>
    </div>
  );
}
