import { resolveLiveCastPlayUrlServer } from "@/lib/cast-resolve-server";
import { recordCastMetric } from "@/lib/cast-metrics";
import {
  isAllowedStreamProxyUserAgent,
  isStreamProxyUaCheckDisabled,
  streamProxyUaAllowExtraFromEnv,
} from "@/lib/stream-client-user-agent";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve a live cast master (same-origin /api/stream?cast=1) to a single
 * Chromecast-safe media-playlist URL.
 *
 * GET /api/cast/resolve?url=<absolute-or-relative-stream-proxy-url>
 */
export async function GET(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!isStreamProxyUaCheckDisabled()) {
    const extras = streamProxyUaAllowExtraFromEnv();
    if (!isAllowedStreamProxyUserAgent(ua, extras)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const origin = new URL(req.url).origin;
  const raw = req.nextUrl.searchParams.get("url")?.trim();
  if (!raw) {
    return NextResponse.json(
      { error: "Missing url parameter." },
      { status: 400 }
    );
  }

  try {
    const playUrl = await resolveLiveCastPlayUrlServer(raw, {
      origin,
      signal: req.signal,
    });
    recordCastMetric("cast_resolve_ok");
    return NextResponse.json(
      { playUrl },
      {
        headers: {
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      }
    );
  } catch (err) {
    recordCastMetric("cast_resolve_fail");
    const message =
      err instanceof Error && err.message
        ? err.message
        : "Could not resolve cast stream.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Accept, Content-Type",
    },
  });
}
