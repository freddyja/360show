import { NextResponse } from "next/server";
import { driveConfigured, fetchDriveEmail, readDriveCookies, refreshAccessToken } from "@/lib/drive/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!driveConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      email: null,
    });
  }

  const { refreshToken } = await readDriveCookies();
  if (!refreshToken) {
    return NextResponse.json({ configured: true, connected: false, email: null });
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    const email = tokens.access_token ? await fetchDriveEmail(tokens.access_token) : null;
    return NextResponse.json({ configured: true, connected: true, email });
  } catch {
    return NextResponse.json({
      configured: true,
      connected: false,
      email: null,
      error: "Google Drive session expired. Connect again in Settings.",
    });
  }
}
