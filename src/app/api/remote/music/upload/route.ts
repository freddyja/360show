import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { r2PresignPut } from "@/lib/r2/objects";
import { noteR2Failure } from "@/lib/r2/status";
import { formatBlobWriteError } from "@/lib/share/access";
import { blobUsable } from "@/lib/share/blobStatus";
import {
  musicUnavailableMessage,
  readSession,
  remoteMusicAvailable,
  resolveRemoteStoreMode,
  sessionIsLive,
  tokenMatches,
} from "@/lib/remote/store";
import { isEventId, isRemoteMusicPath } from "@/lib/remote/types";
import { MAX_CUSTOM_MUSIC_BYTES } from "@/lib/music/custom";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await remoteMusicAvailable())) {
    return NextResponse.json({ error: musicUnavailableMessage() }, { status: 503 });
  }

  const body = (await request.json()) as HandleUploadBody & {
    store?: string;
    pathname?: string;
    contentType?: string;
    eventId?: string;
    token?: string;
  };

  if (body.store === "r2") {
    const mode = await resolveRemoteStoreMode();
    if (mode !== "r2") {
      return NextResponse.json({ error: musicUnavailableMessage() }, { status: 503 });
    }
    const eventId = String(body.eventId || "").trim();
    const pathname = String(body.pathname || "");
    if (!isEventId(eventId) || !isRemoteMusicPath(pathname, eventId)) {
      return NextResponse.json({ error: "Invalid music upload path." }, { status: 400 });
    }
    const session = await readSession(eventId);
    if (!session || !sessionIsLive(session) || !tokenMatches(session, body.token)) {
      return NextResponse.json({ error: "Pair token expired or invalid." }, { status: 401 });
    }
    try {
      const signed = await r2PresignPut(pathname, body.contentType || "application/octet-stream");
      return NextResponse.json({ store: "r2", ...signed });
    } catch (error) {
      noteR2Failure(error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "R2 presign failed" },
        { status: 502 },
      );
    }
  }

  if (!(await blobUsable())) {
    return NextResponse.json({ error: musicUnavailableMessage() }, { status: 503 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { eventId?: string; token?: string } = {};
        try {
          payload = clientPayload ? (JSON.parse(clientPayload) as { eventId?: string; token?: string }) : {};
        } catch {
          throw new Error("Invalid pair payload.");
        }
        const eventId = payload.eventId?.trim() || "";
        if (!isEventId(eventId) || !isRemoteMusicPath(pathname, eventId)) {
          throw new Error("Invalid music upload path.");
        }
        const session = await readSession(eventId);
        if (!session || !sessionIsLive(session) || !tokenMatches(session, payload.token)) {
          throw new Error("Pair token expired or invalid.");
        }
        return {
          allowedContentTypes: [
            "audio/mpeg",
            "audio/mp3",
            "audio/mp4",
            "audio/aac",
            "audio/wav",
            "audio/wave",
            "audio/x-wav",
            "audio/ogg",
            "audio/flac",
            "audio/opus",
            "audio/webm",
            "application/octet-stream",
          ],
          addRandomSuffix: false,
          allowOverwrite: true,
          maximumSizeInBytes: MAX_CUSTOM_MUSIC_BYTES,
          tokenPayload: JSON.stringify({ pathname, eventId }),
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: formatBlobWriteError(error) || (error instanceof Error ? error.message : "Upload failed") },
      { status: 400 },
    );
  }
}
