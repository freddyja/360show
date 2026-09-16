import { NextResponse } from "next/server";
import { blobConfigured, readCloudShare, writeCloudShare } from "@/lib/share/server";
import { isClipId, isFrameStyleId, type CloudShare } from "@/lib/share/types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  if (!isClipId(clipId)) {
    return NextResponse.json({ error: "Invalid clip id" }, { status: 400 });
  }
  if (blobConfigured()) {
    const share = await readCloudShare(clipId);
    if (share) return NextResponse.json(share);
  }
  return NextResponse.json({ error: "Share not found" }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  if (!isClipId(clipId)) {
    return NextResponse.json({ error: "Invalid clip id" }, { status: 400 });
  }

  let body: CloudShare;
  try {
    body = (await request.json()) as CloudShare;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.clipId !== clipId || !body.videoUrl || !isFrameStyleId(body.frameStyle)) {
    return NextResponse.json({ error: "Invalid share payload" }, { status: 400 });
  }

  if (blobConfigured()) {
    await writeCloudShare(body);
    return NextResponse.json({ ok: true, clipId, stored: "blob" });
  }

  if (body.destination === "drive") {
    return NextResponse.json({ ok: true, clipId, stored: "drive" });
  }

  return NextResponse.json(
    { error: "Blob storage is not configured. Set BLOB_READ_WRITE_TOKEN." },
    { status: 503 },
  );
}
