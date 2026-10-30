import { NextResponse } from "next/server";
import {
  isCloudEventId,
  readCloudEvent,
  writeCloudEvent,
} from "@/lib/cloud/server";
import { gate, validRecord } from "@/lib/cloud/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const blocked = gate(request);
  if (blocked) return blocked;
  const { id } = await params;
  if (!isCloudEventId(id))
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const record = await readCloudEvent(id).catch(() => null);
  if (!record)
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: NO_STORE },
    );
  return NextResponse.json(record, { headers: NO_STORE });
}

export async function PUT(request: Request, { params }: Ctx) {
  const blocked = gate(request);
  if (blocked) return blocked;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!validRecord(body) || body.id !== id)
    return NextResponse.json({ error: "Bad record" }, { status: 400 });
  try {
    return NextResponse.json(await writeCloudEvent(body), {
      headers: NO_STORE,
    });
  } catch {
    return NextResponse.json(
      { error: "Cloud store unavailable" },
      { status: 502, headers: NO_STORE },
    );
  }
}

/** Writes a tombstone (so other devices delete it too) instead of removing the file. */
export async function DELETE(request: Request, { params }: Ctx) {
  const blocked = gate(request);
  if (blocked) return blocked;
  const { id } = await params;
  if (!isCloudEventId(id))
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const at =
    Number(new URL(request.url).searchParams.get("updatedAt")) || Date.now();
  try {
    return NextResponse.json(
      await writeCloudEvent({ id, updatedAt: at, deleted: true }),
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { error: "Cloud store unavailable" },
      { status: 502, headers: NO_STORE },
    );
  }
}
