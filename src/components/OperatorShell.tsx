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
    <div className="booth-page p-3 sm:p-4 md:p-5">
      <div className="booth-frame mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-[1400px] flex-col overflow-hidden rounded-[28px] sm:min-h-[calc(100dvh-2rem)] md:min-h-[calc(100dvh-2.5rem)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6 md:p-8">{children}</div>
        <BottomNav eventId={eventId} />
      </div>
    </div>
  );
}
