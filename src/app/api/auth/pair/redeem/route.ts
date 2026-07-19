import {
  attachSessionCookie,
  SessionCookieEncodeError,
} from "@/lib/auth-session-cookie";
import { attachStreamSessionCookie } from "@/lib/auth-stream-session-cookie";
import { clientIp } from "@/lib/client-ip";
import { pairingRedeemAllowed, redeemPairCode } from "@/lib/auth-pairing";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exchange a one-time PIN for Xtream (+ optional Stream) session cookies. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await pairingRedeemAllowed(ip))) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const pin = (body as { pin?: string }).pin;
  if (pin == null || String(pin).trim() === "") {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  const pair = await redeemPairCode(String(pin));
  if (!pair) {
    return NextResponse.json(
      { error: "Invalid or expired code. Generate a new one on your phone." },
      { status: 400 }
    );
  }

  try {
    let streamLinked = false;
    if (pair.streamUserId) {
      const row = await getDb()
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, pair.streamUserId))
        .limit(1)
        .get();
      if (row) {
        const res = NextResponse.json({ ok: true, streamLinked: true });
        attachSessionCookie(res, req, pair.creds);
        await attachStreamSessionCookie(res, req, {
          id: row.id,
          email: row.email,
          name: row.name,
        });
        return res;
      }
    }

    const res = NextResponse.json({ ok: true, streamLinked });
    attachSessionCookie(res, req, pair.creds);
    return res;
  } catch (e) {
    if (e instanceof SessionCookieEncodeError) {
      return NextResponse.json(
        {
          error:
            "Cannot create session on this server (encryption not configured).",
        },
        { status: 503 }
      );
    }
    throw e;
  }
}
