import { NextResponse } from "next/server";
import { isFrameStyleId } from "@/lib/share/types";
import {
  enqueueCommand,
  musicUnavailableMessage,
  newCommandId,
  publicViewNow,
  readCommands,
  readSession,
  remoteMusicAvailable,
  remoteStoreReady,
  sessionIsLive,
  storeUnavailableMessage,
  tokenMatches,
  touchOperatorPing,
  writeRemoteMusicMeta,
} from "@/lib/remote/store";
import {
  clipText,
  isAccentColor,
  isCaptureDurationSec,
  isCloudDestination,
  isEventId,
  isMusicBedLabel,
  isRemoteCommandType,
  isVideoQuality,
  type RemoteCommand,
  type RemoteCommandPayload,
} from "@/lib/remote/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function invalid(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  if (!(await remoteStoreReady())) {
    return NextResponse.json({ error: storeUnavailableMessage() }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    eventId?: string;
    token?: string;
    type?: string;
    payload?: RemoteCommandPayload;
  } | null;

  const eventId = body?.eventId?.trim() || "";
  if (!isEventId(eventId) || !body?.token || !isRemoteCommandType(body.type)) {
    return invalid("Invalid remote command.");
  }

  const session = await readSession(eventId);
  if (!session || !sessionIsLive(session) || !tokenMatches(session, body.token)) {
    return NextResponse.json({ error: "Pair token expired or invalid. Scan the QR from Capture again." }, { status: 401 });
  }

  const incoming = body.payload || {};
  const command: RemoteCommand = {
    id: newCommandId(),
    type: body.type,
    createdAt: Date.now(),
    payload: {},
  };

  if (command.type === "setSpinLength") {
    if (!isCaptureDurationSec(incoming.captureDurationSec)) {
      return invalid("Spin length must be 10, 15, or 20 seconds.");
    }
    command.payload.captureDurationSec = incoming.captureDurationSec;
  }
  if (command.type === "setMusicBed") {
    if (!isMusicBedLabel(incoming.musicBedLabel)) return invalid("Unknown music bed.");
    command.payload.musicBedLabel = incoming.musicBedLabel;
  }
  if (command.type === "setFrameStyle") {
    if (typeof incoming.frameStyle !== "string" || !isFrameStyleId(incoming.frameStyle)) {
      return invalid("Unknown frame style.");
    }
    command.payload.frameStyle = incoming.frameStyle;
  }
  if (command.type === "setEventBranding") {
    const name = incoming.name !== undefined ? clipText(incoming.name, 80) : undefined;
    const clientNames = incoming.clientNames !== undefined ? clipText(incoming.clientNames, 80) : undefined;
    if (incoming.name !== undefined && !name) return invalid("Event name cannot be empty.");
    if (incoming.accentColor !== undefined && !isAccentColor(incoming.accentColor)) {
      return invalid("Accent color must be a #RRGGBB hex value.");
    }
    if (name === undefined && clientNames === undefined && incoming.accentColor === undefined) {
      return invalid("No branding fields to update.");
    }
    if (name) command.payload.name = name;
    if (clientNames !== undefined) command.payload.clientNames = clientNames || "Guests";
    if (incoming.accentColor) command.payload.accentColor = incoming.accentColor;
  }
  if (command.type === "setSlowMo") {
    if (typeof incoming.slowMoEnabled !== "boolean") return invalid("slowMoEnabled must be true or false.");
    command.payload.slowMoEnabled = incoming.slowMoEnabled;
  }
  if (command.type === "setVideoQuality") {
    if (!isVideoQuality(incoming.videoQuality)) return invalid("Video quality must be high or standard.");
    command.payload.videoQuality = incoming.videoQuality;
  }
  if (command.type === "setBoothMusicMuted") {
    if (typeof incoming.boothMusicMuted !== "boolean") return invalid("boothMusicMuted must be true or false.");
    command.payload.boothMusicMuted = incoming.boothMusicMuted;
  }
  if (command.type === "setCloudDestination") {
    if (!isCloudDestination(incoming.cloudDestination)) return invalid("Cloud destination must be blob or drive.");
    command.payload.cloudDestination = incoming.cloudDestination;
    const folder = incoming.driveFolderName !== undefined ? clipText(incoming.driveFolderName, 64) : undefined;
    if (incoming.driveFolderName !== undefined && !folder) return invalid("Drive folder name cannot be empty.");
    if (folder) command.payload.driveFolderName = folder;
  }
  if (command.type === "setCustomMusic") {
    if (!(await remoteMusicAvailable())) {
      return NextResponse.json(
        { error: musicUnavailableMessage() },
        { status: 503 },
      );
    }
    const fileName = clipText(incoming.fileName, 180);
    if (!fileName) return invalid("Missing song file name.");
    if (typeof incoming.size === "number" && (incoming.size < 64 || incoming.size > 18 * 1024 * 1024)) {
      return invalid("Song must be between 64 bytes and 18 MB.");
    }
    command.payload.fileName = fileName;
    if (typeof incoming.contentType === "string") command.payload.contentType = incoming.contentType.slice(0, 80);
    if (typeof incoming.size === "number") command.payload.size = incoming.size;
    await writeRemoteMusicMeta(eventId, {
      fileName,
      contentType: command.payload.contentType || "application/octet-stream",
      size: command.payload.size,
    });
  }

  const existing = await readCommands(eventId);
  if (existing.some((cmd) => cmd.type === "startSpin") && command.type === "startSpin") {
    return NextResponse.json({ error: "A START SPIN is already waiting on the booth." }, { status: 409 });
  }

  const now = Date.now();
  await touchOperatorPing(eventId, now);
  try {
    await enqueueCommand(eventId, command);
  } catch (error) {
    if (error instanceof Error && error.message === "START_SPIN_PENDING") {
      return NextResponse.json({ error: "A START SPIN is already waiting on the booth." }, { status: 409 });
    }
    throw error;
  }
  const pending = await readCommands(eventId);

  return NextResponse.json({
    ok: true,
    commandId: command.id,
    view: await publicViewNow(session, pending[0] ?? null, now),
  });
}
