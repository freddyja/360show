import { NextResponse } from "next/server";
import { readCloudSettings, writeCloudSettings } from "@/lib/cloud/server";
import { gate } from "@/lib/cloud/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const blocked = gate(request);
  if (blocked) return blocked;
  const record = await readCloudSettings().catch(() => null);
  return NextResponse.json(record || { updatedAt: 0, settings: {} }, {
    headers: NO_STORE,
  });
}

export async function PUT(request: Request) {
  const blocked = gate(request);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as {
    updatedAt?: number;
    settings?: unknown;
  } | null;
  if (
    !body ||
    !Number.isFinite(body.updatedAt) ||
    typeof body.settings !== "object" ||
    !body.settings
  ) {
    return NextResponse.json({ error: "Bad settings" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await writeCloudSettings({
        updatedAt: body.updatedAt as number,
        settings: body.settings as Record<string, unknown>,
      }),
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { error: "Cloud store unavailable" },
      { status: 502, headers: NO_STORE },
    );
  }
}
