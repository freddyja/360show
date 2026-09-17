import { NextResponse } from "next/server";
import {
  publicViewNow,
  readCommand,
  readSession,
  remoteStoreReady,
  sessionIsLive,
  storeUnavailableMessage,
  tokenMatches,
  writeCommand,
  writeSession,
} from "@/lib/remote/store";
import {
  isEventId,
  type RemoteAck,
  type RemoteBoothPhase,
  type RemoteEventSnapshot,
} from "@/lib/remote/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PHASES: RemoteBoothPhase[] = ["idle", "countdown", "recording", "processing"];

export async function POST(request: Request) {
  if (!remoteStoreReady()) {
    return NextResponse.json({ error: storeUnavailableMessage() }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    eventId?: string;
    token?: string;
    boothArmed?: boolean;
    boothPhase?: RemoteBoothPhase;
    boothStatus?: string;
    lastClipId?: string | null;
    snapshot?: RemoteEventSnapshot;
    ack?: { commandId: string; ok: boolean; message: string } | null;
  } | null;

  const eventId = body?.eventId?.trim() || "";
  if (!isEventId(eventId) || !body?.token) {
    return NextResponse.json({ error: "Missing booth credentials." }, { status: 400 });
  }

  const session = await readSession(eventId);
  if (!session || !sessionIsLive(session) || !tokenMatches(session, body.token)) {
    return NextResponse.json({ error: "Remote session expired or invalid. Enable remote again on Capture." }, { status: 401 });
  }

  const now = Date.now();
  let pending = await readCommand(eventId);
  let lastAck = session.lastAck;
  if (body.ack?.commandId) {
    const ack: RemoteAck = {
      commandId: body.ack.commandId,
      ok: Boolean(body.ack.ok),
      message: String(body.ack.message || ""),
      at: now,
    };
    if (pending?.id === body.ack.commandId) {
      pending = null;
      await writeCommand(eventId, null);
    }
    lastAck = ack;
  }

  const phase = PHASES.includes(body.boothPhase as RemoteBoothPhase) ? (body.boothPhase as RemoteBoothPhase) : session.boothPhase;
  const next = {
    ...session,
    boothHeartbeatAt: now,
    boothArmed: body.boothArmed !== false,
    boothPhase: phase,
    boothStatus: (body.boothStatus || session.boothStatus).slice(0, 180),
    lastClipId: body.lastClipId === undefined ? session.lastClipId : body.lastClipId,
    snapshot: body.snapshot || session.snapshot,
    lastAck,
  };
  await writeSession(next);

  return NextResponse.json({
    ok: true,
    view: await publicViewNow(next, pending, now),
    pendingCommand: pending,
  });
}
