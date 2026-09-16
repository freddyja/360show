"use client";

import { use } from "react";
import { CaptureScreen } from "@/components/screens/CaptureScreen";

export default function CapturePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return <CaptureScreen eventId={eventId} />;
}
