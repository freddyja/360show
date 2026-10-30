export const MAX_CUSTOM_MUSIC_BYTES = 18 * 1024 * 1024;

const AUDIO_NAME = /\.(mp3|m4a|aac|wav|wave|ogg|oga|flac|opus|mp4|3gp)$/i;

export function customMusicBlobId(eventId: string) {
  return `music:${eventId}:${Date.now().toString(36)}`;
}

export function isCustomMusicBlobId(key: string) {
  return key.startsWith("music:");
}

export function hasCustomMusic(event: { customMusicBlobId?: string | null } | null | undefined) {
  return Boolean(event?.customMusicBlobId);
}

/** Custom file is stored and currently winning over the bundled bed. */
export function usesCustomMusic(
  event: { customMusicBlobId?: string | null; preferBundledBed?: boolean } | null | undefined,
) {
  return Boolean(event?.customMusicBlobId) && !event?.preferBundledBed;
}

export function exportMusicId(event: { customMusicBlobId?: string | null; musicBedLabel?: string | null; preferBundledBed?: boolean } | null | undefined) {
  if (event?.customMusicBlobId && !event.preferBundledBed) {
    return `c${event.customMusicBlobId.replace(/[^A-Za-z0-9]/g, "").slice(-48)}`;
  }
  return null;
}

export function isLikelyAudioFile(file: File) {
  if (file.type.startsWith("audio/")) return true;
  if (file.type === "video/mp4" && /\.m4a$/i.test(file.name)) return true;
  if (!file.type || file.type === "application/octet-stream") return AUDIO_NAME.test(file.name);
  return AUDIO_NAME.test(file.name);
}

export function formatMusicBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateCustomMusicFile(file: File): string | null {
  if (!isLikelyAudioFile(file)) {
    return "Please pick an audio file (mp3, m4a, wav, aac, or ogg).";
  }
  if (file.size > MAX_CUSTOM_MUSIC_BYTES) {
    return `That song is too large (${formatMusicBytes(file.size)}). Max is 18 MB so this phone’s storage stays healthy.`;
  }
  // size 0 is often a cloud placeholder (Drive / Samsung Cloud) — try reading bytes instead of rejecting.
  if (file.size > 0 && file.size < 64) {
    return "That file looks empty. Pick another song.";
  }
  return null;
}

export function musicCaption(
  event: { customMusicName?: string | null; customMusicBlobId?: string | null; musicBedLabel?: string; preferBundledBed?: boolean } | null | undefined,
  fallbackBed: string,
) {
  if (event?.preferBundledBed) return fallbackBed;
  if (event?.customMusicName?.trim()) return event.customMusicName.trim();
  if (event?.customMusicBlobId) return "Song from this phone";
  return fallbackBed;
}
