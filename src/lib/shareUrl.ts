import { clientShareOrigin } from "./share/origin";

export function clipSharePath(clipId: string) {
  return `/s/${clipId}`;
}

export function clipShareUrl(clipId: string, origin?: string) {
  const base = clientShareOrigin(origin);
  return `${base}${clipSharePath(clipId)}`;
}

export function operatorSharePath(eventId: string, clipId: string) {
  return `/e/${eventId}/share/${clipId}`;
}

export function capturePath(eventId: string) {
  return `/e/${eventId}/capture`;
}

export function remoteOperatorPath(eventId: string, token?: string) {
  const path = `/e/${eventId}/remote`;
  return token ? `${path}?k=${encodeURIComponent(token)}` : path;
}
