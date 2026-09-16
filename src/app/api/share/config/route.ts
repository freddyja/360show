import { NextResponse } from "next/server";
import { blobConfigured } from "@/lib/share/server";
import { serverPublicOrigin } from "@/lib/share/origin";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return NextResponse.json({
    origin: serverPublicOrigin(request),
    blobConfigured: blobConfigured(),
  });
}
