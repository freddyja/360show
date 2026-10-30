import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Build id of the deployment serving this request (compared by clients for auto-update). */
export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID || "unknown" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
