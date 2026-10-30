"use client";

import { usePathname } from "next/navigation";
import { BoothProvider } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The tablet is a remote surface only: it never loads the booth's local
  // event/clip store (IndexedDB) and never runs Capture. See src/lib/deviceRole.ts.
  if (pathname === "/tablet" || pathname?.startsWith("/tablet/")) return <>{children}</>;
  return <BoothProvider>{children}</BoothProvider>;
}
