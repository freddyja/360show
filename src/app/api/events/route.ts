import { NextResponse } from "next/server";
import { listCloudEvents, writeCloudEvent } from "@/lib/cloud/server";
import { gate, validRecord } from "@/lib/cloud/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const blocked = gate(request);
  if (blocked) return blocked;
  try {
    return NextResponse.json(
      { events: await listCloudEvents() },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { error: "Cloud store unavailable" },
      { status: 502, headers: NO_STORE },
    );
  }
}

/** Bulk upsert (used for first-load migration and batched sync). */
export async function PUT(request: Request) {
  const blocked = gate(request);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as {
    events?: unknown[];
  } | null;
  const records = (body?.events || []).filter(validRecord).slice(0, 200);
  try {
    const saved = [];
    for (const r of records) saved.push(await writeCloudEvent(r));
    return NextResponse.json({ events: saved }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "Cloud store unavailable" },
      { status: 502, headers: NO_STORE },
    );
  }
}
