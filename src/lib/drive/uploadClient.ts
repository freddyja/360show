"use client";

import { driveDownloadUrl, drivePreviewUrl, driveViewUrl, sanitizeDriveFolderName } from "@/lib/drive/urls";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

function escapeQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `Google Drive request failed (${res.status})`);
  }
  return data;
}

async function findOrCreateFolder(accessToken: string, name: string, parentId?: string) {
  const safe = sanitizeDriveFolderName(name);
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `name='${escapeQueryValue(safe)}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
  const listed = await driveJson<{ files?: { id: string }[] }>(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1&spaces=drive`,
    accessToken,
  );
  if (listed.files?.[0]?.id) return listed.files[0].id;

  const created = await driveJson<{ id: string }>(`${DRIVE_API}/files`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      name: safe,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!created.id) throw new Error("Could not create Google Drive folder");
  return created.id;
}

async function resumableUpload(options: {
  accessToken: string;
  file: File;
  parentId: string;
  name: string;
}) {
  const start = await fetch(`${DRIVE_UPLOAD}?uploadType=resumable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": options.file.type || "application/octet-stream",
      "X-Upload-Content-Length": String(options.file.size),
    },
    body: JSON.stringify({
      name: options.name,
      parents: [options.parentId],
    }),
  });
  if (!start.ok) {
    const err = (await start.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message || "Could not start Google Drive upload");
  }
  const location = start.headers.get("Location");
  if (!location) throw new Error("Google Drive did not return an upload URL");

  const put = await fetch(location, {
    method: "PUT",
    headers: {
      "Content-Type": options.file.type || "application/octet-stream",
      "Content-Length": String(options.file.size),
    },
    body: options.file,
  });
  const uploaded = (await put.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!put.ok || !uploaded.id) {
    throw new Error(uploaded.error?.message || "Google Drive upload failed");
  }
  return uploaded.id;
}

export async function uploadClipToDrive(options: {
  accessToken: string;
  file: File;
  folderName: string;
  eventName: string;
  clipId: string;
}) {
  const rootId = await findOrCreateFolder(options.accessToken, options.folderName);
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
  });

  await driveJson(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions`, options.accessToken, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  return {
    fileId,
    previewUrl: drivePreviewUrl(fileId),
    webViewLink: driveViewUrl(fileId),
    downloadUrl: driveDownloadUrl(fileId),
  };
}
