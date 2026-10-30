import { createHash, timingSafeEqual } from "crypto";
import { list } from "@vercel/blob";
import { getWithStoreAccess, putWithStoreAccess } from "@/lib/share/blobAccess";
import { blobConfigured } from "@/lib/share/server";
import type { CloudEventRecord, CloudSettingsRecord } from "./types";

/** Server-side owner key gate for cloud event/settings sync. */
export function ownerKeyConfigured() {
  return Boolean(process.env.BOOTH_OWNER_KEY?.trim());
}

/** Local `next dev` without Blob uses an in-memory store so sync can be exercised. */
const devMemory = () =>
  process.env.NODE_ENV === "development" && !blobConfigured();
const mem = globalThis as unknown as { __360showCloud?: Map<string, string> };
const memMap = () => (mem.__360showCloud ??= new Map());

export function cloudSyncReady() {
  return ownerKeyConfigured() && (blobConfigured() || devMemory());
}

export function ownerKeyMatches(request: Request) {
  const expected = process.env.BOOTH_OWNER_KEY?.trim();
  const got = request.headers.get("x-booth-key")?.trim() || "";
  if (!expected || !got) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(got).digest();
  return timingSafeEqual(a, b);
}

/** Unguessable, per-key prefix so blob paths can't be enumerated even in a public store. */
function root() {
  const key = process.env.BOOTH_OWNER_KEY?.trim() || "";
  return `booth/${createHash("sha256").update(`360show:${key}`).digest("hex").slice(0, 24)}`;
}

export const isCloudEventId = (id: string) => /^[A-Za-z0-9_-]{1,80}$/.test(id);
const eventPath = (id: string) => `${root()}/events/${id}.json`;
const settingsPath = () => `${root()}/settings.json`;

async function readJson<T>(pathname: string): Promise<T | null> {
  if (devMemory()) {
    const raw = memMap().get(pathname);
    return raw ? (JSON.parse(raw) as T) : null;
  }
  const result = await getWithStoreAccess(pathname);
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return (await new Response(result.stream).json()) as T;
}

async function writeJson(pathname: string, data: unknown) {
  if (devMemory()) {
    memMap().set(pathname, JSON.stringify(data));
    return;
  }
  await putWithStoreAccess(pathname, JSON.stringify(data), {
    contentType: "application/json",
  });
}

export async function readCloudEvent(id: string) {
  return readJson<CloudEventRecord>(eventPath(id));
}

/** Last-write-wins on the server too: an older write never replaces a newer record. */
export async function writeCloudEvent(record: CloudEventRecord) {
  const current = await readCloudEvent(record.id);
  if (current && current.updatedAt > record.updatedAt) return current;
  await writeJson(eventPath(record.id), record);
  return record;
}

export async function listCloudEvents(): Promise<CloudEventRecord[]> {
  const prefix = `${root()}/events/`;
  const ids: string[] = [];
  if (devMemory()) {
    for (const p of memMap().keys())
      if (p.startsWith(prefix))
        ids.push(p.slice(prefix.length).replace(/\.json$/, ""));
  }
  let cursor: string | undefined;
  if (!devMemory())
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      for (const b of page.blobs) {
        const id = b.pathname.slice(prefix.length).replace(/\.json$/, "");
        if (isCloudEventId(id)) ids.push(id);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  const records = await Promise.all(
    ids.map((id) => readCloudEvent(id).catch(() => null)),
  );
  return records.filter((r): r is CloudEventRecord => Boolean(r));
}

export async function readCloudSettings() {
  return readJson<CloudSettingsRecord>(settingsPath());
}

export async function writeCloudSettings(record: CloudSettingsRecord) {
  const current = await readCloudSettings();
  if (current && current.updatedAt > record.updatedAt) return current;
  await writeJson(settingsPath(), record);
  return record;
}
