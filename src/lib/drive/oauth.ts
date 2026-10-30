import { cookies } from "next/headers";
import { DRIVE_RETURN_COOKIE, DRIVE_RT_COOKIE, DRIVE_SCOPES, DRIVE_STATE_COOKIE } from "@/lib/drive/urls";

export function driveConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(request: Request) {
  const explicit = process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit.replace(/\/$/, "");
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  let host = forwardedHost;
  if (host.startsWith("0.0.0.0")) host = host.replace("0.0.0.0", "localhost");
  if (host.startsWith("[::]")) host = host.replace("[::]", "localhost");
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "http";
  return `${proto}://${host}/api/drive/callback`;
}

function cookieSecure(request: Request) {
  if (process.env.NODE_ENV !== "production") return false;
  try {
    return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  } catch {
    return true;
  }
}

export async function setDriveCookies(
  request: Request,
  values: { refreshToken?: string | null; state?: string | null; returnPath?: string | null },
) {
  const store = await cookies();
  const secure = cookieSecure(request);
  const base = { httpOnly: true, sameSite: "lax" as const, path: "/", secure };

  if (values.refreshToken !== undefined) {
    if (values.refreshToken) {
      store.set(DRIVE_RT_COOKIE, values.refreshToken, { ...base, maxAge: 60 * 60 * 24 * 180 });
    } else {
      store.delete(DRIVE_RT_COOKIE);
    }
  }
  if (values.state !== undefined) {
    if (values.state) {
      store.set(DRIVE_STATE_COOKIE, values.state, { ...base, maxAge: 600 });
    } else {
      store.delete(DRIVE_STATE_COOKIE);
    }
  }
  if (values.returnPath !== undefined) {
    if (values.returnPath) {
      store.set(DRIVE_RETURN_COOKIE, values.returnPath, { ...base, maxAge: 600 });
    } else {
      store.delete(DRIVE_RETURN_COOKIE);
    }
  }
}

export async function readDriveCookies() {
  const store = await cookies();
  return {
    refreshToken: store.get(DRIVE_RT_COOKIE)?.value || null,
    state: store.get(DRIVE_STATE_COOKIE)?.value || null,
    returnPath: store.get(DRIVE_RETURN_COOKIE)?.value || null,
  };
}

export function googleAuthUrl(options: { redirectUri: string; state: string }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: options.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token request failed");
  }
  return data;
}

export async function exchangeAuthCode(code: string, redirectUri: string) {
  return tokenRequest(
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
}

export async function refreshAccessToken(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  );
}

export async function fetchDriveEmail(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email || null;
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/";
  }
  return value;
}
