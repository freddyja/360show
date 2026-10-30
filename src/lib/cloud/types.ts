import type { AppSettings, BoothEvent } from "@/lib/types";

/** Event metadata in the cloud (never clips). deleted=true is a tombstone. */
export interface CloudEventRecord {
  id: string;
  updatedAt: number;
  deleted?: boolean;
  event?: BoothEvent;
}

/** Settings shared across this owner's devices (device-only fields excluded). */
export type SyncedSettings = Omit<
  AppSettings,
  "deviceName" | "mockBatteryPct" | "forceOffline"
>;

export interface CloudSettingsRecord {
  updatedAt: number;
  settings: Partial<SyncedSettings>;
}
