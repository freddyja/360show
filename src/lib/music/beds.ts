export const MUSIC_BEDS = [
  "None",
  "Cinematic swell",
  "Romantic piano",
  "First Dance piano",
  "Upbeat house",
  "Silent disco pulse",
] as const;

export type MusicBedLabel = (typeof MUSIC_BEDS)[number];

export interface MusicBedDef {
  id: string;
  label: MusicBedLabel;
  src: string | null;
  mood: "silent" | "soft" | "party";
}

export const MUSIC_BED_CATALOG: MusicBedDef[] = [
  { id: "none", label: "None", src: null, mood: "silent" },
  { id: "cinematic-swell", label: "Cinematic swell", src: "/music/cinematic-swell.wav", mood: "soft" },
  { id: "romantic-piano", label: "Romantic piano", src: "/music/romantic-piano.wav", mood: "soft" },
  { id: "first-dance-piano", label: "First Dance piano", src: "/music/first-dance-piano.wav", mood: "soft" },
  { id: "upbeat-house", label: "Upbeat house", src: "/music/upbeat-house.wav", mood: "party" },
  { id: "silent-disco-pulse", label: "Silent disco pulse", src: "/music/silent-disco-pulse.wav", mood: "party" },
];

const LABEL_ALIASES: Record<string, MusicBedLabel> = {
  "Can't Help Falling in Love (instrumental)": "Romantic piano",
  "Can't Help Falling in Love": "Romantic piano",
  "Upbeat house bed": "Upbeat house",
};

export const SOFT_MUSIC_BEDS: MusicBedLabel[] = [
  "Cinematic swell",
  "Romantic piano",
  "First Dance piano",
];

export function normalizeMusicBedLabel(label: string | null | undefined): MusicBedLabel {
  if (!label) return "None";
  const aliased = LABEL_ALIASES[label];
  if (aliased) return aliased;
  return (MUSIC_BEDS as readonly string[]).includes(label) ? (label as MusicBedLabel) : "None";
}

export function musicBedDef(label: string | null | undefined): MusicBedDef {
  const normalized = normalizeMusicBedLabel(label);
  return MUSIC_BED_CATALOG.find((bed) => bed.label === normalized) ?? MUSIC_BED_CATALOG[0];
}

export function musicBedById(id: string | null | undefined): MusicBedDef {
  if (!id) return MUSIC_BED_CATALOG[0];
  return MUSIC_BED_CATALOG.find((bed) => bed.id === id) ?? MUSIC_BED_CATALOG[0];
}

export function musicBedSrc(label: string | null | undefined) {
  return musicBedDef(label).src;
}

export function hasMusicBed(label: string | null | undefined) {
  return musicBedDef(label).id !== "none";
}

export function musicBedId(label: string | null | undefined) {
  return musicBedDef(label).id;
}
