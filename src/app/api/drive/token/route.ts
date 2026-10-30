import { NextResponse } from "next/server";
import {
  driveConfigured,
  fetchDriveEmail,
  readDriveCookies,
  refreshAccessToken,
} from "@/lib/drive/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!driveConfigured()) {
    return NextResponse.json(
      { error: "Google Drive is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 503 },
    );
  }

  const { refreshToken } = await readDriveCookies();
  if (!refreshToken) {
    return NextResponse.json(
      { error: "Google Drive is not connected. Open Settings and tap Connect." },
      { status: 401 },
    );
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    if (!tokens.access_token) {
      throw new Error("No access token");
    }
    const email = await fetchDriveEmail(tokens.access_token);
    return NextResponse.json({
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in || 3600,
      email,
    });
  } catch {
    return NextResponse.json(
      { error: "Google Drive session expired. Connect again in Settings." },
      { status: 401 },
    );
  }
}
