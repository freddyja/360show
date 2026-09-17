import { NextResponse } from "next/server";
import { getBlobAvailability, readCloudShare, writeCloudShare } from "@/lib/share/server";
import {
  BLOB_STORE_UNAVAILABLE_MESSAGE,
  CLOUD_SHARE_UNAVAILABLE_MESSAGE,
  formatBlobWriteError,
} from "@/lib/share/access";
import { isClipId, isFrameStyleId, type CloudShare } from "@/lib/share/types";
import { cloudObjectStoreStatus, resolveCloudObjectStore } from "@/lib/storage/cloudStore";

export const dynamic = "force-dynamic";

function drivePayloadComplete(body: CloudShare) {
  return body.destination === "drive" && Boolean(body.driveFileId || body.webViewLink);
}

export async function GET(_request: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  if (!isClipId(clipId)) {
    return NextResponse.json({ error: "Invalid clip id" }, { status: 400 });
  }
  try {
    const share = await readCloudShare(clipId);
    if (share) return NextResponse.json(share);
  } catch (error) {
    const message = formatBlobWriteError(error);
    return NextResponse.json({ error: message }, { status: 502 });
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

  const store = await resolveCloudObjectStore();
  if (store !== "none") {
    try {
      await writeCloudShare(body);
      return NextResponse.json({ ok: true, clipId, stored: store });
    } catch (error) {
      const message = formatBlobWriteError(error);
      if (drivePayloadComplete(body)) {
        return NextResponse.json({
          ok: true,
          clipId,
          stored: "drive",
          warning: message,
        });
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (drivePayloadComplete(body)) {
    return NextResponse.json({ ok: true, clipId, stored: "drive" });
  }

  const cloud = await cloudObjectStoreStatus();
  const blob = await getBlobAvailability();
  return NextResponse.json(
    { error: cloud.cloudShareUnavailableReason || blob.message || BLOB_STORE_UNAVAILABLE_MESSAGE || CLOUD_SHARE_UNAVAILABLE_MESSAGE },
    { status: 503 },
  );
}
