import type { NextConfig } from "next";

// Build id baked into both the client bundle and /api/version, so a running
// page can tell when a newer deployment is live.
const buildId =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `dev-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  async headers() {
    return [{ source: "/api/version", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] }];
  },
};

export default nextConfig;
