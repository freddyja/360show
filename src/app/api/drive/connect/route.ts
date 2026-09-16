import { NextResponse } from "next/server";
import {
  driveConfigured,
  googleAuthUrl,
  googleRedirectUri,
  safeReturnPath,
  setDriveCookies,
} from "@/lib/drive/oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnPath = safeReturnPath(url.searchParams.get("return"));

  if (!driveConfigured()) {
    const target = new URL(returnPath, url.origin);
    target.searchParams.set("drive", "error");
    target.searchParams.set(
      "reason",
      "Google Drive is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
    return NextResponse.redirect(target);
  }
  const state = crypto.randomUUID();
  await setDriveCookies(request, { state, returnPath });
  const redirectUri = googleRedirectUri(request);
  return NextResponse.redirect(googleAuthUrl({ redirectUri, state }));
}
