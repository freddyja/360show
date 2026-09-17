"use client";

import { use } from "react";
import { Suspense } from "react";
import { RemoteOperatorScreen } from "@/components/screens/RemoteOperatorScreen";

export default function RemoteOperatorPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return (
    <Suspense
      fallback={
        <div className="booth-page p-6 text-slate-200">
          <p>Loading remote operator…</p>
        </div>
      }
    >
      <RemoteOperatorScreen eventId={eventId} />
    </Suspense>
  );
}
