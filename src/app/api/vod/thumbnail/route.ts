import { clientIp } from "@/lib/client-ip";
import { newRequestId, STREAM_PROXY_REQUEST_ID_HEADER } from "@/lib/request-id";
import {
  isAllowedStreamProxyUserAgent,
  isStreamProxyUaCheckDisabled,
  streamProxyUaAllowExtraFromEnv,
} from "@/lib/stream-client-user-agent";
import { limitStreamProxy } from "@/lib/stream-rate-limit";
import { getVodSeekPreviewJpeg } from "@/lib/vod-thumbnail-server";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId = newRequestId();
  const ua = req.headers.get("user-agent") ?? "";

  const rl = limitStreamProxy(clientIp(req));
  if (!rl.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: {
        "retry-after": String(rl.retryAfterSec),
        [STREAM_PROXY_REQUEST_ID_HEADER]: requestId,
      },
    });
  }

  if (!isStreamProxyUaCheckDisabled()) {
    const extras = streamProxyUaAllowExtraFromEnv();
    if (!isAllowedStreamProxyUserAgent(ua, extras)) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const url = new URL(req.url);
  const upstream = url.searchParams.get("u");
  const tRaw = parseFloat(url.searchParams.get("t") ?? "0");
  const t = Number.isFinite(tRaw) && tRaw >= 0 ? Math.floor(tRaw) : 0;

  if (!upstream) {
    return new Response("Missing u", { status: 400 });
  }

  try {
    const parsed = new URL(upstream);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response("Invalid upstream", { status: 400 });
    }
  } catch {
    return new Response("Invalid upstream", { status: 400 });
  }

  const jpeg = await getVodSeekPreviewJpeg(upstream, t);
  if (!jpeg) {
    return new Response("Thumbnail unavailable", {
      status: 404,
      headers: { [STREAM_PROXY_REQUEST_ID_HEADER]: requestId },
    });
  }

  return new Response(new Uint8Array(jpeg), {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(jpeg.byteLength),
      "cache-control": "public, max-age=3600",
      [STREAM_PROXY_REQUEST_ID_HEADER]: requestId,
    },
  });
}
