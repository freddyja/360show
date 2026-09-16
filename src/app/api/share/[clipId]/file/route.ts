import { NextResponse } from "next/server";
import { blobConfigured, readShareVideo } from "@/lib/share/server";
import { isClipId } from "@/lib/share/types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  if (!isClipId(clipId)) {
    return NextResponse.json({ error: "Invalid clip id" }, { status: 400 });
  }
  if (!blobConfigured()) {
    return NextResponse.json({ error: "Blob storage is not configured." }, { status: 503 });
  }

  try {
    const video = await readShareVideo(clipId);
    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
    return new Response(video.stream, {
      headers: {
        "Content-Type": video.contentType,
        "Content-Length": String(video.size),
        "Content-Disposition": video.contentDisposition || "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read video";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
