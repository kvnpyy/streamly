import {
  isCastMetricEvent,
  recordCastMetric,
  type CastMetricEvent,
} from "@/lib/cast-metrics";
import {
  isAllowedStreamProxyUserAgent,
  isStreamProxyUaCheckDisabled,
  streamProxyUaAllowExtraFromEnv,
} from "@/lib/stream-client-user-agent";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Client-reported cast funnel events (no URLs / credentials). */
const CLIENT_EVENTS = new Set<CastMetricEvent>([
  "cast_prep_ok",
  "cast_prep_fail",
  "cast_load_ok",
  "cast_playing",
  "cast_stall",
  "cast_idle_error",
  "cast_session_fail",
]);

/**
 * POST /api/cast/events
 * Body: { event: CastMetricEvent, kind?: string, channelId?: number }
 */
export async function POST(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!isStreamProxyUaCheckDisabled()) {
    const extras = streamProxyUaAllowExtraFromEnv();
    if (!isAllowedStreamProxyUserAgent(ua, extras)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const event =
    body &&
    typeof body === "object" &&
    "event" in body &&
    typeof (body as { event: unknown }).event === "string"
      ? (body as { event: string }).event
      : "";

  if (!isCastMetricEvent(event) || !CLIENT_EVENTS.has(event)) {
    return NextResponse.json({ ok: false, error: "unknown_event" }, { status: 400 });
  }

  recordCastMetric(event);
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Accept, Content-Type",
    },
  });
}
