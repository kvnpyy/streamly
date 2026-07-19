/**
 * Mint a NextAuth JWT session cookie so TV PIN redeem can carry Stream identity.
 */

import type { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

/** Match [`auth.ts`](../auth.ts) session.maxAge */
const STREAM_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 90;

function resolveAuthSecret(): string {
  const raw = process.env.AUTH_SECRET?.trim();
  if (raw && raw.length >= 16) return raw;
  if (process.env.NODE_ENV !== "production") {
    return "iptv-stream-local-auth-secret-dev-only-min-length!!!";
  }
  return "iptv-stream-production-missing-auth-secret-replace-me!!!";
}

function useSecureCookies(req: NextRequest): boolean {
  const proto =
    req.headers.get("x-forwarded-proto") ||
    req.nextUrl.protocol.replace(":", "");
  return proto === "https";
}

export function streamSessionCookieName(secure: boolean): string {
  return secure ? "__Secure-authjs.session-token" : "authjs.session-token";
}

export async function attachStreamSessionCookie(
  res: NextResponse,
  req: NextRequest,
  user: { id: string; email: string; name?: string | null }
): Promise<void> {
  const secure = useSecureCookies(req);
  const cookieName = streamSessionCookieName(secure);
  const secret = resolveAuthSecret();
  const token = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name ?? undefined,
    },
    secret,
    salt: cookieName,
    maxAge: STREAM_SESSION_MAX_AGE_SEC,
  });
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: STREAM_SESSION_MAX_AGE_SEC,
  });
}
