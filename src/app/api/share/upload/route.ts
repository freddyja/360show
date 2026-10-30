import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { BLOB_STORE_UNAVAILABLE_MESSAGE, formatBlobWriteError, isBlobUnusableError } from "@/lib/share/access";
import { getBlobAvailability } from "@/lib/share/server";
import { noteBlobFailure } from "@/lib/share/blobStatus";
import { isClipId } from "@/lib/share/types";

export const dynamic = "force-dynamic";

function isAllowedVideoPath(pathname: string) {
  const match = pathname.match(/^shares\/([^/]+)\/(video|export)\.(webm|mp4|mov)$/);
  return Boolean(match && isClipId(match[1]));
}

export async function POST(request: Request) {
  const blob = await getBlobAvailability();
  if (!blob.usable) {
    return NextResponse.json(
      { error: blob.message || BLOB_STORE_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

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
