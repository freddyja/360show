import { NextResponse } from "next/server";
import { blobConfigured } from "@/lib/share/server";
import { serverPublicOrigin } from "@/lib/share/origin";
import { driveConfigured, readDriveCookies } from "@/lib/drive/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { refreshToken } = driveConfigured() ? await readDriveCookies() : { refreshToken: null };

  return NextResponse.json({
    origin: serverPublicOrigin(request),
    blobConfigured: blobConfigured(),
    driveConfigured: driveConfigured(),
    driveConnected: Boolean(refreshToken),
    driveEmail: null,
  });
}
