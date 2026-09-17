import { NextResponse } from "next/server";
import { blobConfigured } from "@/lib/share/server";
import { resolveBlobAccess } from "@/lib/share/blobAccess";
import { serverPublicOrigin } from "@/lib/share/origin";
import { driveConfigured, readDriveCookies } from "@/lib/drive/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { refreshToken } = driveConfigured() ? await readDriveCookies() : { refreshToken: null };
  let blobAccess: "public" | "private" | null = null;
  let blobAccessError: string | null = null;
  if (blobConfigured()) {
    try {
      blobAccess = await resolveBlobAccess();
    } catch (error) {
      blobAccessError = error instanceof Error ? error.message : "Could not detect Blob store access";
    }
  }

  return NextResponse.json({
    origin: serverPublicOrigin(request),
    blobConfigured: blobConfigured(),
    blobAccess,
    blobAccessError,
    driveConfigured: driveConfigured(),
    driveConnected: Boolean(refreshToken),
    driveEmail: null,
  });
}
