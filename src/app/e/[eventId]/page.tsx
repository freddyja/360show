"use client";

import { use } from "react";
import { EventSetupScreen } from "@/components/screens/EventSetupScreen";

export default function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return <EventSetupScreen key={eventId} eventId={eventId} />;
}
