"use client";

import { use } from "react";
import { GalleryScreen } from "@/components/screens/GalleryScreen";

export default function GalleryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return <GalleryScreen eventId={eventId} />;
}
