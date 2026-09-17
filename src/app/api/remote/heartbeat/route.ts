import { NextResponse } from "next/server";
import {
  publicViewNow,
  readCommands,
  readSession,
  remoteStoreReady,
  removeCommands,
  sessionIsLive,
  storeUnavailableMessage,
  tokenMatches,
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
    acks?: { commandId: string; ok: boolean; message: string }[] | null;
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
  const acks: RemoteAck[] = [];
  const incoming = [
    ...(Array.isArray(body.acks) ? body.acks : []),
    ...(body.ack?.commandId ? [body.ack] : []),
  ];
  for (const item of incoming) {
    if (!item?.commandId) continue;
    acks.push({
      commandId: item.commandId,
      ok: Boolean(item.ok),
      message: String(item.message || ""),
      at: now,
    });
  }
  if (acks.length) {
    await removeCommands(
      eventId,
      acks.map((item) => item.commandId),
    );
  }

  const pendingList = await readCommands(eventId);
  const lastAck = acks[acks.length - 1] ?? session.lastAck;

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
    view: await publicViewNow(next, pendingList[0] ?? null, now),
    pendingCommand: pendingList[0] ?? null,
    pendingCommands: pendingList,
  });
}
