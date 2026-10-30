import { NextResponse } from "next/server";
import { checkOwnerKey, cloudSyncReady, isCloudEventId } from "./server";
import type { CloudEventRecord } from "./types";

const NO_STORE = { "Cache-Control": "no-store" };

export function gate(request: Request) {
  if (!cloudSyncReady()) {
    return NextResponse.json(
      { error: "Cloud sync not configured", configured: false },
      { status: 503, headers: NO_STORE },
    );
  }
  const check = checkOwnerKey(request);
  if (check !== "ok") {
    return NextResponse.json(
      {
        error:
          check === "missing-header"
            ? "Owner key required (x-booth-key header missing)"
            : "Owner key does not match",
        reason: check,
        configured: true,
      },
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
