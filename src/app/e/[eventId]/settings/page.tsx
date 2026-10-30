"use client";

import { use } from "react";
import { SettingsScreen } from "@/components/screens/SettingsScreen";

export default function SettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return <SettingsScreen eventId={eventId} />;
}
