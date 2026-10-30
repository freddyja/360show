import { NextResponse } from "next/server";
import {
  publicViewNow,
  readCommand,
  readSession,
  remoteStoreReady,
  sessionIsLive,
  storeUnavailableMessage,
  tokenMatches,
  touchOperatorPing,
} from "@/lib/remote/store";
import { isEventId } from "@/lib/remote/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await remoteStoreReady())) {
    return NextResponse.json({ error: storeUnavailableMessage() }, { status: 503 });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId")?.trim() || "";
  const token = url.searchParams.get("token") || "";
  if (!isEventId(eventId) || !token) {
    return NextResponse.json({ error: "Missing pair token." }, { status: 400 });
  }

  const session = await readSession(eventId);
  if (!session || !sessionIsLive(session) || !tokenMatches(session, token)) {
    return NextResponse.json({ error: "Not paired. Open the link or enter the code from Capture." }, { status: 401 });
  }

  const now = Date.now();
  await touchOperatorPing(eventId, now);
  const pending = await readCommand(eventId);
  return NextResponse.json({ view: await publicViewNow(session, pending, now) });
}
