import type { BoothEvent } from "./types";

export const SAMPLE_EVENT_ID = "evt_maya_jordan_sample";

export function sampleEvent(now = Date.now()): BoothEvent {
  return {
    id: SAMPLE_EVENT_ID,
    name: "Tonight's Event",
    date: "2026-06-20",
    clientNames: "Maya & Jordan",
    accentColor: "#3B82F6",
    logoDataUrl: null,
    musicBedLabel: "Romantic piano",
    customMusicBlobId: null,
    customMusicName: null,
    captureDurationSec: 10,
    frameStyle: "gold-oval",
    createdAt: now,
    updatedAt: now,
    isSample: true,
  };
}
