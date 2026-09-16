export function clipSharePath(clipId: string) {
  return `/s/${clipId}`;
}

export function clipShareUrl(clipId: string, origin?: string) {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  return `${base}${clipSharePath(clipId)}`;
}

export function operatorSharePath(eventId: string, clipId: string) {
  return `/e/${eventId}/share/${clipId}`;
}

export function capturePath(eventId: string) {
  return `/e/${eventId}/capture`;
}
