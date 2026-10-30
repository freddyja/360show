"use client";

import { use } from "react";
import { GuestShareScreen } from "@/components/screens/GuestShareScreen";

export default function PublicSharePage({ params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = use(params);
  return <GuestShareScreen clipId={clipId} publicMode />;
}
