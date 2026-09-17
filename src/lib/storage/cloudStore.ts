import { CLOUD_SHARE_UNAVAILABLE_MESSAGE, r2Configured } from "@/lib/r2/env";
import { getR2Availability, r2Usable } from "@/lib/r2/status";
import { blobUsable } from "@/lib/share/blobStatus";

export type CloudObjectStore = "blob" | "r2" | "none";

export type CloudObjectStoreStatus = {
  store: CloudObjectStore;
  blobUsable: boolean;
  r2Configured: boolean;
  r2Usable: boolean;
  r2UnavailableReason: string | null;
  cloudShareReady: boolean;
  cloudShareUnavailableReason: string | null;
};

/** Prefer a healthy Vercel Blob store; otherwise Cloudflare R2 when env is set. */
export async function resolveCloudObjectStore(): Promise<CloudObjectStore> {
  if (await blobUsable()) return "blob";
  if (r2Configured() && (await r2Usable())) return "r2";
  return "none";
}

export async function cloudObjectStoreStatus(): Promise<CloudObjectStoreStatus> {
  const blobOk = await blobUsable();
  const r2 = r2Configured()
    ? await getR2Availability()
    : { configured: false, usable: false, message: null };
  const store: CloudObjectStore = blobOk ? "blob" : r2.usable ? "r2" : "none";
  const cloudShareReady = store !== "none";
  return {
    store,
    blobUsable: blobOk,
    r2Configured: r2.configured,
    r2Usable: r2.usable,
    r2UnavailableReason: r2.usable ? null : r2.message,
    cloudShareReady,
    cloudShareUnavailableReason: cloudShareReady
      ? null
      : r2.configured && r2.message
        ? r2.message
        : CLOUD_SHARE_UNAVAILABLE_MESSAGE,
  };
}
