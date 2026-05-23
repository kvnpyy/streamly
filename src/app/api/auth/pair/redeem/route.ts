import {
  attachSessionCookie,
  SessionCookieEncodeError,
} from "@/lib/auth-session-cookie";
import { clientIp } from "@/lib/client-ip";
import { pairingRedeemAllowed, redeemPairCode } from "@/lib/auth-pairing";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exchange a one-time PIN for an HttpOnly session cookie (same shape as password login). */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!pairingRedeemAllowed(ip)) {
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

  const creds = redeemPairCode(String(pin));
  if (!creds) {
    return NextResponse.json(
      { error: "Invalid or expired code. Generate a new one on your phone." },
      { status: 400 }
    );
  }

  try {
    const res = NextResponse.json({ ok: true });
    attachSessionCookie(res, req, creds);
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
