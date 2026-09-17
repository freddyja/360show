"use client";

import { use } from "react";
import { GuestShareScreen } from "@/components/screens/GuestShareScreen";

export default function OperatorSharePage({
  params,
}: {
  params: Promise<{ eventId: string; clipId: string }>;
}) {
  const { eventId, clipId } = use(params);
  return <GuestShareScreen eventId={eventId} clipId={clipId} />;
}
