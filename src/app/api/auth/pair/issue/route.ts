import { auth } from "@/auth";
import {
  decodeSessionCookiePayload,
  SESSION_COOKIE_NAME,
} from "@/lib/auth-session-cookie";
import { issuePairCode, PAIR_TTL_MS } from "@/lib/auth-pairing";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a short-lived PIN so another device (e.g. TV) can claim the same
 * Xtream session — and, when the issuer is Stream-signed-in, the Stream session
 * (Continue Watching / favorites sync).
 */
export async function POST() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const creds = decodeSessionCookiePayload(raw);
  if (!creds) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const session = await auth();
  const streamUserId =
    typeof session?.user?.id === "string" ? session.user.id : null;

  const pin = await issuePairCode(creds, { streamUserId });
  return NextResponse.json({
    pin,
    expiresInSeconds: Math.floor(PAIR_TTL_MS / 1000),
    includesStreamSession: Boolean(streamUserId),
  });
}
