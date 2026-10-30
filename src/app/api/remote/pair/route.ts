import { NextResponse } from "next/server";
import { serverPublicOrigin } from "@/lib/share/origin";
import {
  createPairSession,
  publicViewNow,
  remoteStoreReady,
  resolveRemoteStoreMode,
  storeUnavailableMessage,
} from "@/lib/remote/store";
import { isEventId, type RemoteEventSnapshot } from "@/lib/remote/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await remoteStoreReady())) {
    return NextResponse.json({ error: storeUnavailableMessage() }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    eventId?: string;
    snapshot?: RemoteEventSnapshot;
  } | null;
  const eventId = body?.eventId?.trim() || "";
  if (!isEventId(eventId)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }
  if (!body?.snapshot?.name || !body.snapshot.frameStyle) {
    return NextResponse.json({ error: "Missing event snapshot." }, { status: 400 });
  }

  try {
    const session = await createPairSession(eventId, body.snapshot);
    const origin = serverPublicOrigin(request);
    const remoteUrl = `${origin}/e/${encodeURIComponent(eventId)}/remote?k=${encodeURIComponent(session.token)}`;
    return NextResponse.json({
      token: session.token,
      pairCode: session.pairCode,
      remoteUrl,
      expiresAt: session.expiresAt,
      store: await resolveRemoteStoreMode(),
      view: await publicViewNow(session, null),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create remote session." },
      { status: 500 },
    );
  }
}
