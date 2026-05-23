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
 * Create a short-lived PIN so another device (e.g. TV) can claim the same Xtream session.
 * Caller must already have a valid HttpOnly session cookie.
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

  const pin = issuePairCode(creds);
  return NextResponse.json({
    pin,
    expiresInSeconds: Math.floor(PAIR_TTL_MS / 1000),
  });
}
