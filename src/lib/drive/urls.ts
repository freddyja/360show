export const DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

export const DRIVE_RT_COOKIE = "snap360_drive_rt";
export const DRIVE_STATE_COOKIE = "snap360_drive_oauth";
export const DRIVE_RETURN_COOKIE = "snap360_drive_return";

export function drivePreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

export function driveViewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view?usp=sharing`;
}

export function driveDownloadUrl(fileId: string) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

export function isDrivePlaybackUrl(src: string | null | undefined) {
  if (!src) return false;
  return src.includes("drive.google.com") || src.includes("docs.google.com");
}

export function sanitizeDriveFolderName(value: string, fallback = "360show") {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 80) || fallback;
}
