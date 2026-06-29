import { recordIptvApiError } from "@/lib/iptv-api-error-metrics";
import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import {
  decodeSessionCookiePayload,
  SESSION_COOKIE_NAME,
} from "@/lib/auth-session-cookie";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { isTvClassUserAgent } from "@/lib/tv-user-agent";
import { verifyTurnstileToken } from "@/lib/turnstile-verify";

function normalizeServer(s: string): string {
  return s.trim().replace(/\/+$/, "");
}

/** Constant-time password compare when lengths match. */
function passwordsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * True when the IPTV session cookie matches the credentials on this `/api/xtream` request
 * (returning user / bootstrap — exempt from Turnstile).
 */
export function iptvSessionCookieMatchesRequestCreds(
  req: NextRequest,
  headerCreds: XtreamCredentials
): boolean {
  const raw = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return false;
  const fromCookie = decodeSessionCookiePayload(raw);
  if (!fromCookie) return false;

  return (
    normalizeServer(fromCookie.server) === normalizeServer(headerCreds.server) &&
    fromCookie.username === headerCreds.username &&
    passwordsEqual(fromCookie.password, headerCreds.password)
  );
}

/**
 * Panel auth probe = request with no `action` query param (see {@link xtream.authenticate}).
 * Optionally gated by Turnstile when `STREAM_TURNSTILE_SECRET_KEY` is set.
 */
export async function enforceXtreamAuthProbeCaptcha(
  req: NextRequest,
  headerCreds: XtreamCredentials,
  action: string | null
): Promise<NextResponse | null> {
  const secretConfigured = Boolean(
    process.env.STREAM_TURNSTILE_SECRET_KEY?.trim()
  );
  if (!secretConfigured) return null;

  const isAuthProbe = action === null || action === "";
  if (!isAuthProbe) return null;

  if (iptvSessionCookieMatchesRequestCreds(req, headerCreds)) {
    return null;
  }

  /** Signed-in Streamly users reconnecting a playlist — same trust as saved-provider verify. */
  try {
    const { auth } = await import("@/auth");
    const streamlySession = await auth();
    if (streamlySession?.user?.id) {
      return null;
    }
  } catch {
    /* auth unavailable in tests / edge */
  }

  /**
   * Living-room browsers (Tizen, webOS, Fire TV Silk, etc.): Cloudflare Turnstile
   * often breaks on old WebKit `postMessage` shapes (`data` not a string → `.split`
   * TypeError). We skip the widget client-side for these UAs; match that here so
   * first-time Xtream login from the TV still works. Abuse surface is bounded by
   * existing `/api/xtream` + provider rate limits.
   */
  const ua = req.headers.get("user-agent") ?? "";
  if (isTvClassUserAgent(ua)) {
    return null;
  }

  const token = req.headers.get("x-turnstile-token")?.trim();
  if (!token) {
    recordIptvApiError("turnstile_required");
    return NextResponse.json(
      {
        error:
          "Complete the verification challenge (Turnstile), then try again.",
      },
      { status: 400 }
    );
  }

  const ok = await verifyTurnstileToken(token);
  if (!ok) {
    recordIptvApiError("turnstile_failed");
    return NextResponse.json(
      { error: "Verification challenge failed. Refresh and try again." },
      { status: 403 }
    );
  }

  return null;
}
