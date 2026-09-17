import { NextResponse } from "next/server";
import {
  expireSession,
  readSession,
  remoteStoreReady,
  storeUnavailableMessage,
  tokenMatches,
} from "@/lib/remote/store";
import { isEventId } from "@/lib/remote/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await remoteStoreReady())) {
    return NextResponse.json({ error: storeUnavailableMessage() }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { eventId?: string; token?: string } | null;
  const eventId = body?.eventId?.trim() || "";
  if (!isEventId(eventId) || !body?.token) {
    return NextResponse.json({ error: "Missing booth credentials." }, { status: 400 });
  }

  const session = await readSession(eventId);
  if (!session || !tokenMatches(session, body.token)) {
    return NextResponse.json({ ok: true });
  }

  await expireSession(eventId);
  return NextResponse.json({ ok: true });
}
