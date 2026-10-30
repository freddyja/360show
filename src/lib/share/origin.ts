export function stripTrailingSlash(url: string) {
  return url.replace(/\/$/, "");
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function originFromRequest(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  let host = forwardedHost || hostHeader || url.host;
  if (host.startsWith("0.0.0.0")) host = host.replace("0.0.0.0", "localhost");
  if (host.startsWith("[::]")) host = host.replace("[::]", "localhost");
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "http";
  return `${proto}://${host}`;
}

/** Server-side public origin for guest QR links. */
export function serverPublicOrigin(request?: Request) {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return stripTrailingSlash(explicit);
  if (process.env.VERCEL_URL) return `https://${stripTrailingSlash(process.env.VERCEL_URL)}`;
  if (request) return originFromRequest(request);
  return "http://localhost:3000";
}

/**
 * Client-side origin for QR / copy / sms.
 * Prefers NEXT_PUBLIC_APP_URL, then a server-provided VERCEL origin, then window origin.
 */
export function clientShareOrigin(configOrigin?: string | null) {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return stripTrailingSlash(explicit);
  if (configOrigin) {
    try {
      const host = new URL(configOrigin).hostname;
      if (!isLoopbackHost(host)) return stripTrailingSlash(configOrigin);
    } catch {
      return stripTrailingSlash(configOrigin);
    }
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}
