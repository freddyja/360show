"use client";

import { use } from "react";
import { CrowdScreen } from "@/components/screens/CrowdScreen";

export default function CrowdPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return <CrowdScreen eventId={eventId} />;
}
