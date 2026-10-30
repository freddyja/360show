"use client";

import { Suspense } from "react";
import { TabletOperatorScreen } from "@/components/screens/TabletOperatorScreen";

export default function TabletPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#07101c] p-6 text-slate-200">
          Loading tablet remote…
        </div>
      }
    >
      <TabletOperatorScreen />
    </Suspense>
  );
}
