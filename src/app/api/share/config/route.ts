import { NextResponse } from "next/server";
import { blobAccessFromEnv } from "@/lib/share/blobAccess";
import { getBlobAvailability } from "@/lib/share/blobStatus";
import { serverPublicOrigin } from "@/lib/share/origin";
import { driveConfigured, readDriveCookies } from "@/lib/drive/oauth";
import {
  remoteMusicAvailable,
  remoteStoreReady,
  resolveRemoteStoreMode,
  storeUnavailableMessage,
} from "@/lib/remote/store";
import { cloudObjectStoreStatus } from "@/lib/storage/cloudStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { refreshToken } = driveConfigured() ? await readDriveCookies() : { refreshToken: null };
  const blob = await getBlobAvailability();
  const cloud = await cloudObjectStoreStatus();
  const remoteStore = await resolveRemoteStoreMode();
  const remoteAvailable = await remoteStoreReady();
  const musicOk = await remoteMusicAvailable();

  return NextResponse.json({
    origin: serverPublicOrigin(request),
    blobConfigured: blob.usable,
    blobTokenPresent: blob.tokenPresent,
    blobUnavailableReason: blob.usable ? null : blob.message,
    blobAccess: blob.usable ? blobAccessFromEnv() : null,
    blobAccessError: blob.usable ? null : blob.message,
    r2Configured: cloud.r2Configured,
    r2Usable: cloud.r2Usable,
    r2UnavailableReason: cloud.r2UnavailableReason,
    cloudStore: cloud.store,
    cloudShareReady: cloud.cloudShareReady,
    cloudShareUnavailableReason: cloud.cloudShareUnavailableReason,
    remoteAvailable,
    remoteStore,
    remoteUnavailableReason: remoteAvailable ? null : storeUnavailableMessage(),
    remoteMusicAvailable: musicOk,
    driveConfigured: driveConfigured(),
    driveConnected: Boolean(refreshToken),
    driveEmail: null,
  });
}
