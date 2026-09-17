import { NextResponse } from "next/server";
import {
  pairCodeMatches,
  publicViewNow,
  readCommand,
  readSession,
  remoteStoreReady,
  sessionIsLive,
  storeUnavailableMessage,
  touchOperatorPing,
} from "@/lib/remote/store";
import { isEventId } from "@/lib/remote/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await remoteStoreReady())) {
    return NextResponse.json({ error: storeUnavailableMessage() }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { eventId?: string; pairCode?: string } | null;
  const eventId = body?.eventId?.trim() || "";
  const pairCode = body?.pairCode || "";
  if (!isEventId(eventId) || pairCode.trim().length < 4) {
    return NextResponse.json({ error: "Enter the 6-character code shown on Capture." }, { status: 400 });
  }

  const session = await readSession(eventId);
  if (!session || !sessionIsLive(session) || !pairCodeMatches(session, pairCode)) {
    return NextResponse.json({ error: "Invalid or expired pair code." }, { status: 401 });
  }

  const now = Date.now();
  await touchOperatorPing(eventId, now);
  const pending = await readCommand(eventId);
  return NextResponse.json({
    token: session.token,
    pairCode: session.pairCode,
    view: await publicViewNow(session, pending, now),
  });
}
