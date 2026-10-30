import { NextResponse } from "next/server";
import { MAX_CUSTOM_MUSIC_BYTES, isLikelyAudioFile } from "@/lib/music/custom";
import {
  musicUnavailableMessage,
  readRemoteMusic,
  readSession,
  remoteMusicAvailable,
  remoteStoreReady,
  sessionIsLive,
  storeUnavailableMessage,
  tokenMatches,
  writeRemoteMusic,
} from "@/lib/remote/store";
import { isEventId } from "@/lib/remote/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await remoteStoreReady())) {
    return NextResponse.json({ error: storeUnavailableMessage() }, { status: 503 });
  }
  if (!(await remoteMusicAvailable())) {
    return NextResponse.json({ error: musicUnavailableMessage() }, { status: 503 });
  }
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId")?.trim() || "";
  const token = url.searchParams.get("token") || "";
  if (!isEventId(eventId) || !token) {
    return NextResponse.json({ error: "Missing pair token." }, { status: 400 });
  }
  const session = await readSession(eventId);
  if (!session || !sessionIsLive(session) || !tokenMatches(session, token)) {
    return NextResponse.json({ error: "Pair token expired or invalid." }, { status: 401 });
  }
  const music = await Promise.race([
    readRemoteMusic(eventId),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), 25_000);
    }),
  ]).catch(() => "timeout" as const);
  if (music === "timeout") {
    return NextResponse.json({ error: "Timed out reading the laptop song." }, { status: 504 });
  }
  if (!music) {
    return NextResponse.json({ error: "No laptop song is waiting on this pair." }, { status: 404 });
  }
  const body = new Uint8Array(music.bytes);
  return new NextResponse(body, {
    headers: {
      "content-type": music.contentType || "application/octet-stream",
      "content-disposition": `attachment; filename="${music.fileName.replace(/"/g, "")}"`,
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  if (!(await remoteStoreReady())) {
    return NextResponse.json({ error: storeUnavailableMessage() }, { status: 503 });
  }
  if (!(await remoteMusicAvailable())) {
    return NextResponse.json({ error: musicUnavailableMessage() }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const eventId = String(form?.get("eventId") || "").trim();
  const token = String(form?.get("token") || "");
  const file = form?.get("file");
  if (!isEventId(eventId) || !token) {
    return NextResponse.json({ error: "Missing pair token." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an audio file on this laptop." }, { status: 400 });
  }
  if (!isLikelyAudioFile(file)) {
    return NextResponse.json({ error: "Please pick an audio file (mp3, m4a, wav, aac, or ogg)." }, { status: 400 });
  }
  if (file.size > MAX_CUSTOM_MUSIC_BYTES || file.size < 64) {
    return NextResponse.json({ error: "That song is empty or larger than 18 MB." }, { status: 400 });
  }

  const session = await readSession(eventId);
  if (!session || !sessionIsLive(session) || !tokenMatches(session, token)) {
    return NextResponse.json({ error: "Pair token expired or invalid." }, { status: 401 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeRemoteMusic(eventId, bytes, {
    fileName: file.name.slice(0, 180),
    contentType: file.type || "application/octet-stream",
  });
  return NextResponse.json({ ok: true, fileName: file.name, size: bytes.length });
}
