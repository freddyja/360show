/**
 * Device roles (booth split):
 * - "booth": the PHONE wired to the booth. It alone runs Capture, opens the
 *   camera (getUserMedia), records, burns frames, mixes music, and drives hardware.
 * - "tablet": a remote surface only. It sends start / stop / settings commands
 *   through /api/remote/* and never touches the camera, recorder, or audio.
 *
 * The tablet page marks the window as "tablet" on mount; booth-only entry
 * points call assertBoothRole() so a wrong import fails loudly instead of
 * silently opening a camera on the tablet. Static check: scripts/check-tablet-split.mjs.
 */
export type DeviceRole = "booth" | "tablet";

const KEY = "__360showDeviceRole";

export function setDeviceRole(role: DeviceRole) {
  if (typeof window !== "undefined") (window as unknown as Record<string, unknown>)[KEY] = role;
}

export function deviceRole(): DeviceRole {
  if (typeof window === "undefined") return "booth";
  return (window as unknown as Record<string, unknown>)[KEY] === "tablet" ? "tablet" : "booth";
}

export function assertBoothRole(what: string) {
  if (deviceRole() === "tablet") {
    throw new Error(`${what} runs only on the booth phone, never on the tablet remote.`);
  }
}
