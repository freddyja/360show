import { NextResponse } from "next/server";
import { readShareVideo } from "@/lib/share/server";
import { CLOUD_SHARE_UNAVAILABLE_MESSAGE } from "@/lib/share/access";
import { isClipId } from "@/lib/share/types";
import { cloudObjectStoreStatus } from "@/lib/storage/cloudStore";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  if (!isClipId(clipId)) {
    return NextResponse.json({ error: "Invalid clip id" }, { status: 400 });
  }

  try {
    const video = await readShareVideo(clipId);
    if (video) {
      return new Response(video.stream, {
        headers: {
          "Content-Type": video.contentType,
          "Content-Length": String(video.size),
          "Content-Disposition": video.contentDisposition || "inline",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read video";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const cloud = await cloudObjectStoreStatus();
  if (!cloud.cloudShareReady) {
    return NextResponse.json(
      { error: cloud.cloudShareUnavailableReason || CLOUD_SHARE_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: "Video not found" }, { status: 404 });
}
