import { NextResponse } from "next/server";
import { cloudSyncReady, isCloudEventId, ownerKeyMatches } from "./server";
import type { CloudEventRecord } from "./types";

const NO_STORE = { "Cache-Control": "no-store" };

export function gate(request: Request) {
  if (!cloudSyncReady()) {
    return NextResponse.json(
      { error: "Cloud sync not configured", configured: false },
      { status: 503, headers: NO_STORE },
    );
  }
  if (!ownerKeyMatches(request)) {
    return NextResponse.json(
      { error: "Owner key required", configured: true },
      { status: 401, headers: NO_STORE },
    );
  }
  return null;
}

export function validRecord(r: unknown): r is CloudEventRecord {
  const x = r as CloudEventRecord;
  return Boolean(
    x &&
    typeof x.id === "string" &&
    isCloudEventId(x.id) &&
    Number.isFinite(x.updatedAt) &&
    (x.deleted === true || (x.event && x.event.id === x.id)),
  );
}
