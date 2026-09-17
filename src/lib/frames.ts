import type { FrameStyleId, RampProfileId } from "./types";

export interface FrameCaptionLayout {
  /** Vertical center of the name strip, 0–1 from the top of the overlay. */
  y: number;
  color: string;
  tracking: string;
  rotateDeg?: number;
}

export interface FrameStyleMeta {
  id: FrameStyleId;
  name: string;
  description: string;
  caption?: string;
  subtitle?: string;
  assetSrc?: string;
  defaultAccent?: string;
  rampProfile: RampProfileId;
  /** Event-setup thumbnail object-position. */
  thumbAlign?: "center" | "bottom";
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
    thumbAlign: "bottom",
  },
  {
    id: "polaroid-stack",
    name: "Polaroid stack",
    description: "Warm instant-film border with a stacked print and caption strip",
    assetSrc: "/frames/polaroid-stack.png",
    defaultAccent: "#F5F0E8",
    rampProfile: "time-ramp-gentle",
    thumbAlign: "center",
  },
  {
    id: "disco-chrome",
    name: "Disco chrome",
    description: "Silver bezel, specular highlights, nightclub energy",
    assetSrc: "/frames/disco-chrome.png",
    defaultAccent: "#67E8F9",
    rampProfile: "time-ramp-v1",
    thumbAlign: "center",
  },
  {
    id: "black-tie-bar",
    name: "Black-tie bar",
    description: "Matte black frame with an ivory plaque for names",
    assetSrc: "/frames/black-tie-bar.png",
    defaultAccent: "#0A0A0A",
    rampProfile: "time-ramp-gentle",
    thumbAlign: "bottom",
  },
];

export function getFrameStyle(id: FrameStyleId | string) {
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

export function frameCaptionLayout(id?: FrameStyleId | string | null): FrameCaptionLayout | null {
  if (id === "polaroid-stack") {
    return { y: 0.855, color: "#4A4036", tracking: "0.16em", rotateDeg: -1.3 };
  }
  if (id === "disco-chrome") {
    return { y: 0.905, color: "#E8FBFF", tracking: "0.28em" };
  }
  if (id === "black-tie-bar") {
    return { y: 0.9, color: "#F4EFE4", tracking: "0.32em" };
  }
  return null;
}

/** Keep HUD chips off bottom plaques (CF, polaroid, black-tie). */
export function frameHudTop(id?: FrameStyleId | string | null) {
  return id === "christian-fellowship" || id === "polaroid-stack" || id === "black-tie-bar";
}
