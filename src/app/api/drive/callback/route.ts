import { NextResponse } from "next/server";
import {
  driveConfigured,
  exchangeAuthCode,
  googleRedirectUri,
  readDriveCookies,
  safeReturnPath,
  setDriveCookies,
} from "@/lib/drive/oauth";

export const dynamic = "force-dynamic";

function redirectWith(request: Request, returnPath: string, params: Record<string, string>) {
  const origin = new URL(request.url).origin;
  const target = new URL(returnPath, origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stored = await readDriveCookies();
  const returnPath = safeReturnPath(stored.returnPath);

  if (!driveConfigured()) {
    return redirectWith(request, returnPath, {
      drive: "error",
      reason: "Google Drive OAuth is not configured on this deploy.",
    });
  }

  const error = url.searchParams.get("error");
  if (error) {
    await setDriveCookies(request, { state: null, returnPath: null });
    return redirectWith(request, returnPath, {
      drive: "error",
      reason: error === "access_denied" ? "Google Drive access was denied." : error,
    });
  }

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!code || !state || !stored.state || state !== stored.state) {
    await setDriveCookies(request, { state: null, returnPath: null });
    return redirectWith(request, returnPath, {
      drive: "error",
      reason: "Google sign-in expired. Try Connect again.",
    });
  }

  try {
    const tokens = await exchangeAuthCode(code, googleRedirectUri(request));
    if (!tokens.refresh_token) {
      throw new Error("Google did not return a refresh token. Remove 360show from your Google account permissions and connect again.");
    }
    await setDriveCookies(request, {
      refreshToken: tokens.refresh_token,
      state: null,
      returnPath: null,
    });
    return redirectWith(request, returnPath, { drive: "connected" });
  } catch (error) {
    await setDriveCookies(request, { state: null, returnPath: null });
    return redirectWith(request, returnPath, {
      drive: "error",
      reason: error instanceof Error ? error.message : "Google Drive connect failed.",
    });
  }
}
