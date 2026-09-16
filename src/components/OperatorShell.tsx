"use client";

import { BottomNav } from "./BottomNav";

export function OperatorShell({
  eventId,
  children,
}: {
  eventId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#05080f] p-3 sm:p-4 md:p-5">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-[1400px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0a101c] shadow-[0_0_80px_rgba(15,23,42,0.8)] sm:min-h-[calc(100dvh-2rem)] md:min-h-[calc(100dvh-2.5rem)]">
        <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6 md:p-8">{children}</div>
        <BottomNav eventId={eventId} />
      </div>
    </div>
  );
}
