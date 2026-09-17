import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { r2PresignPut } from "@/lib/r2/objects";
import { noteR2Failure, r2Usable } from "@/lib/r2/status";
import {
  BLOB_STORE_UNAVAILABLE_MESSAGE,
  CLOUD_SHARE_UNAVAILABLE_MESSAGE,
  R2_SETUP_HINT,
  formatBlobWriteError,
  isBlobUnusableError,
} from "@/lib/share/access";
import { getBlobAvailability } from "@/lib/share/server";
import { noteBlobFailure } from "@/lib/share/blobStatus";
import { isClipId } from "@/lib/share/types";
import { cloudObjectStoreStatus } from "@/lib/storage/cloudStore";

export const dynamic = "force-dynamic";

function isAllowedVideoPath(pathname: string) {
  const match = pathname.match(/^shares\/([^/]+)\/(video|export)\.(webm|mp4|mov)$/);
  return Boolean(match && isClipId(match[1]));
}

async function r2PresignResponse(pathname: string, contentType: string) {
  if (!isAllowedVideoPath(pathname)) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  }
  try {
    const signed = await r2PresignPut(pathname, contentType || "application/octet-stream");
    return NextResponse.json({ store: "r2", ...signed });
  } catch (error) {
    noteR2Failure(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "R2 presign failed" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody & {
    store?: string;
    pathname?: string;
    contentType?: string;
  };

  if (body.store === "r2") {
    if (!(await r2Usable())) {
      const cloud = await cloudObjectStoreStatus();
      return NextResponse.json(
        { error: cloud.cloudShareUnavailableReason || `${CLOUD_SHARE_UNAVAILABLE_MESSAGE} ${R2_SETUP_HINT}` },
        { status: 503 },
      );
    }
    return r2PresignResponse(String(body.pathname || ""), String(body.contentType || "application/octet-stream"));
  }

  const blob = await getBlobAvailability();
  if (!blob.usable) {
    if (await r2Usable()) {
      const pathname = typeof body.pathname === "string" ? body.pathname : "";
      if (pathname) {
        return r2PresignResponse(pathname, "application/octet-stream");
      }
    }
    const cloud = await cloudObjectStoreStatus();
    return NextResponse.json(
      { error: cloud.cloudShareUnavailableReason || blob.message || BLOB_STORE_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAllowedVideoPath(pathname)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: [
            "video/webm",
            "video/mp4",
            "video/quicktime",
            "application/octet-stream",
          ],
          addRandomSuffix: false,
          allowOverwrite: true,
          maximumSizeInBytes: 80 * 1024 * 1024,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async () => {
        // Metadata is written by the booth client after upload returns.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    noteBlobFailure(error);
    return NextResponse.json(
      { error: formatBlobWriteError(error) || (error instanceof Error ? error.message : "Upload failed") },
      { status: isBlobUnusableError(error) ? 503 : 400 },
    );
  }
}
