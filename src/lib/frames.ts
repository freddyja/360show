import type { FrameStyleId, RampProfileId } from "./types";

export interface FrameStyleMeta {
  id: FrameStyleId;
  name: string;
  description: string;
  caption?: string;
  subtitle?: string;
  assetSrc?: string;
  defaultAccent?: string;
  rampProfile: RampProfileId;
}

export const FRAME_STYLES: FrameStyleMeta[] = [
  {
    id: "gold-oval",
    name: "Gold Oval",
    description: "Ornate elliptical frame for formal weddings",
    rampProfile: "time-ramp-v1",
  },
  {
    id: "neon-ring",
    name: "Neon Ring",
    description: "Electric 360 platform glow",
    rampProfile: "time-ramp-v1",
  },
  {
    id: "midnight-arch",
    name: "Midnight Arch",
    description: "Dark arch with sparkle corners",
    rampProfile: "time-ramp-v1",
  },
  {
    id: "classic-plaque",
    name: "Classic Plaque",
    description: "Bottom nameplate with event branding",
    rampProfile: "time-ramp-v1",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Thin gallery border",
    rampProfile: "time-ramp-v1",
  },
  {
    id: "christian-fellowship",
    name: "Christian Fellowship",
    description: "Faith · Family · Community",
    caption: "Christian Fellowship",
    subtitle: "Faith · Family · Community",
    assetSrc: "/frames/christian-fellowship.png",
    defaultAccent: "#C9A227",
    rampProfile: "time-ramp-gentle",
  },
];

export function getFrameStyle(id: FrameStyleId) {
  return FRAME_STYLES.find((style) => style.id === id) ?? FRAME_STYLES[0];
}

export function rampProfileForFrame(id: FrameStyleId): RampProfileId {
  return getFrameStyle(id).rampProfile;
}

/** Minimal is a web-only thin border — nothing to composite into the file. */
export function isBurnableFrame(id?: FrameStyleId | string | null) {
  return Boolean(id && id !== "minimal");
}

export function frameBakeId(id?: FrameStyleId | string | null) {
  return isBurnableFrame(id) ? String(id) : "none";
}
