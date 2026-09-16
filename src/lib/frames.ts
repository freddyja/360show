import type { FrameStyleId } from "./types";

export interface FrameStyleMeta {
  id: FrameStyleId;
  name: string;
  description: string;
}

export const FRAME_STYLES: FrameStyleMeta[] = [
  {
    id: "gold-oval",
    name: "Gold Oval",
    description: "Ornate elliptical frame for formal weddings",
  },
  {
    id: "neon-ring",
    name: "Neon Ring",
    description: "Electric 360 platform glow",
  },
  {
    id: "midnight-arch",
    name: "Midnight Arch",
    description: "Dark arch with sparkle corners",
  },
  {
    id: "classic-plaque",
    name: "Classic Plaque",
    description: "Bottom nameplate with event branding",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Thin gallery border",
  },
];

export function getFrameStyle(id: FrameStyleId) {
  return FRAME_STYLES.find((style) => style.id === id) ?? FRAME_STYLES[0];
}
