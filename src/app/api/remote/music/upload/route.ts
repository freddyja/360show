import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { formatBlobWriteError } from "@/lib/share/access";
import { blobConfigured } from "@/lib/share/server";
import {
  readSession,
  sessionIsLive,
  tokenMatches,
} from "@/lib/remote/store";
import { isEventId, isRemoteMusicPath } from "@/lib/remote/types";
import { MAX_CUSTOM_MUSIC_BYTES } from "@/lib/music/custom";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: "Use POST /api/remote/music for local uploads when Blob is not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

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
      onUploadCompleted: async () => undefined,
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: formatBlobWriteError(error) || (error instanceof Error ? error.message : "Upload failed") },
      { status: 400 },
    );
  }
}
