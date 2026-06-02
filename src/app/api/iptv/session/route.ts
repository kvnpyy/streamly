import {
  attachSessionCookie,
  decodeSessionCookiePayload,
  SESSION_COOKIE_NAME,
  SessionCookieEncodeError,
  sessionCookieOptions,
} from "@/lib/auth-session-cookie";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current Xtream session (HttpOnly cookie — works when localStorage is blocked). */
export async function GET() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ creds: null });
  }
  const creds = decodeSessionCookiePayload(raw);
  return NextResponse.json({ creds });
}

/** Save Xtream cookie after login succeeds (guest or after picking a saved provider). */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const creds = (body as { creds?: XtreamCredentials }).creds;
  if (
    !creds ||
    typeof creds.server !== "string" ||
    typeof creds.username !== "string" ||
    typeof creds.password !== "string"
  ) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
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
            "Server cannot save your session (encryption not configured). Ask the host to set STREAM_SESSION_SECRET.",
        },
        { status: 503 }
      );
    }
    throw e;
  }
}

/** Clear Xtream HttpOnly cookie (NextAuth sign-out is separate). */
export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(req),
    maxAge: 0,
  });
  return res;
}
