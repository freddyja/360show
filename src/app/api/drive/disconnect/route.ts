import { NextResponse } from "next/server";
import { setDriveCookies } from "@/lib/drive/oauth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await setDriveCookies(request, { refreshToken: null, state: null, returnPath: null });
  return NextResponse.json({ ok: true });
}
