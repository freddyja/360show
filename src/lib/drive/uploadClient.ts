"use client";

import {
  driveDownloadUrl,
  drivePreviewUrl,
  driveViewUrl,
  sanitizeDriveFolderName,
} from "@/lib/drive/urls";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

function escapeQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveJson<T>(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      data.error?.message || `Google Drive request failed (${res.status})`,
    );
  }
  return data;
}

async function findOrCreateFolder(
  accessToken: string,
  name: string,
  parentId?: string,
) {
  const safe = sanitizeDriveFolderName(name);
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `name='${escapeQueryValue(safe)}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
  const listed = await driveJson<{ files?: { id: string }[] }>(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1&spaces=drive`,
    accessToken,
  );
  if (listed.files?.[0]?.id) return listed.files[0].id;

  const created = await driveJson<{ id: string }>(
    `${DRIVE_API}/files`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name: safe,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    },
  );
  if (!created.id) throw new Error("Could not create Google Drive folder");
  return created.id;
}

async function resumableUpload(options: {
  accessToken: string;
  file: File;
  parentId: string;
  name: string;
  onProgress?: (fraction: number) => void;
}) {
  const start = await fetch(`${DRIVE_UPLOAD}?uploadType=resumable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": options.file.type || "application/octet-stream",
      "X-Upload-Content-Length": String(options.file.size),
      // (Content-Length is set by the browser; it is a forbidden header for scripts.)
    },
    body: JSON.stringify({
      name: options.name,
      parents: [options.parentId],
    }),
  });
  if (!start.ok) {
    const err = (await start.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      err?.error?.message || "Could not start Google Drive upload",
    );
  }
  const location = start.headers.get("Location");
  if (!location) throw new Error("Google Drive did not return an upload URL");

  return putResumable(location, options.file, options.onProgress);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PutResult = { status: number; body: string; range: string | null };

/** PUT bytes with XHR so we get upload progress (fetch has none). Network errors resolve as status 0. */
function xhrPut(
  url: string,
  body: Blob | null,
  headers: Record<string, string>,
  onProgress?: (loaded: number) => void,
) {
  return new Promise<PutResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      resolve({
        status: xhr.status,
        body: xhr.responseText,
        range: xhr.getResponseHeader("Range"),
      });
    xhr.onerror = () => resolve({ status: 0, body: "", range: null });
    xhr.ontimeout = () => resolve({ status: 0, body: "", range: null });
    xhr.send(body);
  });
}

function parseId(body: string) {
  try {
    return (JSON.parse(body) as { id?: string }).id || null;
  } catch {
    return null;
  }
}

/**
 * Upload to a Drive resumable session. On a network drop or 5xx, ask Drive how
 * many bytes it has (Content-Range: bytes * /size) and resume from there.
 */
async function putResumable(
  location: string,
  file: File,
  onProgress?: (fraction: number) => void,
) {
  const size = file.size;
  const type = file.type || "application/octet-stream";
  let offset = 0;
  let lastError = "Google Drive upload failed";
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      await sleep(Math.min(8_000, 1_000 * 2 ** (attempt - 1)));
      const probe = await xhrPut(location, null, {
        "Content-Range": `bytes */${size}`,
      });
      if (probe.status === 200 || probe.status === 201) {
        const id = parseId(probe.body);
        if (id) return id;
      }
      if (probe.status === 404 || probe.status === 410)
        throw new Error(
          "Google Drive upload session expired. Tap Retry upload.",
        );
      if (probe.status === 308) {
        const m = probe.range?.match(/bytes=0-(\d+)/);
        offset = m ? Number(m[1]) + 1 : 0;
      } else if (probe.status !== 0 && probe.status < 500) {
        break;
      }
    }
    const chunk = offset > 0 ? file.slice(offset) : file;
    const headers: Record<string, string> = { "Content-Type": type };
    if (offset > 0)
      headers["Content-Range"] = `bytes ${offset}-${size - 1}/${size}`;
    const res = await xhrPut(location, chunk, headers, (loaded) =>
      onProgress?.(Math.min(1, (offset + loaded) / size)),
    );
    if (res.status === 200 || res.status === 201) {
      const id = parseId(res.body);
      if (id) {
        onProgress?.(1);
        return id;
      }
      lastError = "Google Drive did not return a file id";
      continue;
    }
    if (res.status === 0 || res.status === 308 || res.status >= 500) {
      lastError =
        res.status === 0
          ? "Network dropped during Google Drive upload"
          : `Google Drive upload error (${res.status})`;
      continue;
    }
    try {
      lastError =
        (JSON.parse(res.body) as { error?: { message?: string } }).error
          ?.message || lastError;
    } catch {}
    break;
  }
  throw new Error(lastError);
}

export async function uploadClipToDrive(options: {
  accessToken: string;
  file: File;
  folderName: string;
  eventName: string;
  clipId: string;
  onProgress?: (fraction: number) => void;
}) {
  const rootId = await findOrCreateFolder(
    options.accessToken,
    options.folderName,
  );
  const eventId = await findOrCreateFolder(
    options.accessToken,
    sanitizeDriveFolderName(options.eventName, "event"),
    rootId,
  );
  const fileId = await resumableUpload({
    accessToken: options.accessToken,
    file: options.file,
    parentId: eventId,
    name: options.file.name || `${options.clipId}.webm`,
    onProgress: options.onProgress,
  });

  // Guests open the QR without a Google login, so the file must be anyone-with-link.
  // Retry transient failures; if it still fails, the share is not published (no dead QR).
  let shared = false;
  let shareError: unknown = null;
  for (let attempt = 0; attempt < 3 && !shared; attempt++) {
    try {
      if (attempt) await sleep(1_000 * attempt);
      await driveJson(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions`,
        options.accessToken,
        {
          method: "POST",
          body: JSON.stringify({ role: "reader", type: "anyone" }),
        },
      );
      shared = true;
    } catch (error) {
      shareError = error;
    }
  }
  if (!shared) {
    const detail =
      shareError instanceof Error ? shareError.message : "unknown error";
    throw new Error(
      `Uploaded to Drive but could not make it viewable by link (${detail}). Your Google Workspace may block public links.`,
    );
  }

  return {
    fileId,
    previewUrl: drivePreviewUrl(fileId),
    webViewLink: driveViewUrl(fileId),
    downloadUrl: driveDownloadUrl(fileId),
  };
}
