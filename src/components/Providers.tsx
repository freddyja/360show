"use client";

import { BoothProvider } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return <BoothProvider>{children}</BoothProvider>;
}
