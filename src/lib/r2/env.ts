export const R2_NOT_CONFIGURED_MESSAGE =
  "Cloudflare R2 is not configured yet. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME on Vercel.";

export const R2_UNAVAILABLE_MESSAGE =
  "Cloudflare R2 is configured but not reachable. Check the bucket name and API token.";

export const CLOUD_SHARE_UNAVAILABLE_MESSAGE =
  "Cloud share is temporarily unavailable. Download still works on this tablet.";

export function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim(),
  );
}

export function r2PublicBaseUrl() {
  const raw = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function r2Env() {
  if (!r2Configured()) {
    throw new Error(R2_NOT_CONFIGURED_MESSAGE);
  }
  return {
    accountId: process.env.R2_ACCOUNT_ID!.trim(),
    accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    bucket: process.env.R2_BUCKET_NAME!.trim(),
    publicBase: r2PublicBaseUrl(),
  };
}
