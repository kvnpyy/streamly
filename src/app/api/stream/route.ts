import { rewriteHlsManifest } from "@/lib/hls-manifest-rewrite";
import { sanitizeTvMasterPlaylistIfNeeded } from "@/lib/hls-manifest-tv-sanitize";
import {
  getCachedManifest,
  LIVE_HLS_MANIFEST_CACHE_TTL_MS,
  manifestCacheKey,
  setCachedManifest,
} from "@/lib/stream-manifest-cache";
import { clientIp } from "@/lib/client-ip";
import { newRequestId, STREAM_PROXY_REQUEST_ID_HEADER } from "@/lib/request-id";
import { passthroughStreamWithGracefulClose } from "@/lib/stream-proxy-passthrough";
import { maybeLogStreamUpstreamSlow } from "@/lib/stream-proxy-slow-log";
import {
  isAllowedStreamProxyUserAgent,
  isStreamProxyUaCheckDisabled,
  streamProxyUaAllowExtraFromEnv,
} from "@/lib/stream-client-user-agent";
import { limitStreamProxy } from "@/lib/stream-rate-limit";
import {
  handleVodTranscodeRequest,
  isVodTranscodeEnabledServer,
} from "@/lib/vod-transcode";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxied manifests rewrite segment URIs to `/api/stream?u=…` (encoded upstream URL).
 * Upstream URLs may embed provider tokens or Xtream path segments — never log raw `u`
 * or forward opaque errors to clients in production (see fetchUpstream catch).
 *
 * Inbound clients must send a browser-class UA (`Mozilla/…`) or match
 * `STREAM_PROXY_UA_ALLOW_EXTRA`; see `stream-client-user-agent.ts`.
 *
 * Every response sets `x-request-id`; slow upstream completes log via `stream-proxy-slow-log.ts`.
 */
// Note: we deliberately do NOT forward the browser's `user-agent`. Most IPTV
// providers reject requests with browser UAs (especially on tokenized segment
// CDNs) returning 403. We always send an IPTV-friendly UA below.
const FORWARD_REQUEST_HEADERS = [
  "range",
  "accept",
  "accept-language",
  "if-range",
  "if-modified-since",
  "if-none-match",
];

// Known-good UAs used by IPTV apps. Many providers allowlist these.
//   - HLS / live: most providers (and tokenized HLS CDNs) prefer the
//     Smarters/Android UA; some 403 anything else.
//   - VOD (movies/series): we use VLC. Some providers (ours included) return
//     200 OK with the *full* file when the Smarters UA sends a Range header,
//     instead of the correct 206 Partial Content. That breaks seeking and
//     blows up memory. VLC's UA gets the proper 206 from every provider
//     we've tested.
const IPTV_UA_HLS =
  "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 IPTVSmartersPlayer/3.1.5";
const IPTV_UA_VOD = "VLC/3.0.20 LibVLC/3.0.20";

const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "etag",
  "last-modified",
];

async function fetchUpstream(
  urlStr: string,
  init: RequestInit
): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(urlStr, init);
    last = res;
    const retry =
      res.status === 502 || res.status === 503 || res.status === 504;
    if (!retry || attempt === 2) return res;
    await new Promise((r) => setTimeout(r, 220 * (attempt + 1)));
  }
  return last!;
}

function corsHeaders(extra: HeadersInit = {}, requestId?: string): Headers {
  const h = new Headers(extra);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  h.set(
    "Access-Control-Allow-Headers",
    "Range, Origin, Accept, Accept-Language, Content-Type"
  );
  const baseExpose =
    "Content-Length, Content-Range, Accept-Ranges, X-Vod-Duration-Sec, X-Vod-Start-Offset-Sec, X-Vod-Encoded-Sec";
  h.set(
    "Access-Control-Expose-Headers",
    requestId ? `${baseExpose}, ${STREAM_PROXY_REQUEST_ID_HEADER}` : baseExpose
  );
  if (requestId) {
    h.set(STREAM_PROXY_REQUEST_ID_HEADER, requestId);
  }
  return h;
}

function isManifest(contentType: string | null, urlPath: string) {
  if (urlPath.toLowerCase().endsWith(".m3u8")) return true;
  if (!contentType) return false;
  return /mpegurl|m3u|x-mpegurl/i.test(contentType);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function HEAD(req: NextRequest) {
  return handle(req, /*head*/ true);
}

export async function GET(req: NextRequest) {
  return handle(req, /*head*/ false);
}

async function handle(req: NextRequest, head: boolean) {
  const requestId = newRequestId();
  const ua = req.headers.get("user-agent") ?? "";

  const rl = limitStreamProxy(clientIp(req));
  if (!rl.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: corsHeaders(
        {
          "content-type": "text/plain",
          "retry-after": String(rl.retryAfterSec),
        },
        requestId
      ),
    });
  }

  if (!isStreamProxyUaCheckDisabled()) {
    const extras = streamProxyUaAllowExtraFromEnv();
    if (!isAllowedStreamProxyUserAgent(ua, extras)) {
      return new Response("Forbidden", {
        status: 403,
        headers: corsHeaders({ "content-type": "text/plain" }, requestId),
      });
    }
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("u");
  const type = url.searchParams.get("type") || "vod";
  /**
   * Strip HEVC/Dolby ladder rungs when a safer variant exists (all HLS clients).
   * Also propagates `compat=mse` on rewritten nested playlist URLs.
   */
  const compatMse =
    type === "hls" || url.searchParams.get("compat") === "mse";

  if (!target) {
    return new Response("Missing 'u' parameter", {
      status: 400,
      headers: corsHeaders({ "content-type": "text/plain" }, requestId),
    });
  }

  const transcodeMode = url.searchParams.get("transcode");
  if (transcodeMode === "hls") {
    if (!isVodTranscodeEnabledServer()) {
      return new Response("VOD transcode is not enabled.", {
        status: 503,
        headers: corsHeaders({ "content-type": "text/plain" }, requestId),
      });
    }
    const media = url.searchParams.get("media");
    const tcReset = url.searchParams.has("tc_reset");
    const tcSeekRaw = parseFloat(url.searchParams.get("tc_seek") ?? "0");
    const tcSeek =
      Number.isFinite(tcSeekRaw) && tcSeekRaw > 0
        ? Math.floor(tcSeekRaw)
        : 0;
    const forCast = url.searchParams.get("cast") === "1";
    const tc = await handleVodTranscodeRequest({
      upstream: target,
      media,
      head,
      signal: req.signal,
      compatMse,
      resetCache: tcReset,
      seekSec: tcSeek,
      forCast,
      proxyOrigin: forCast ? new URL(req.url).origin : undefined,
    });
    const tcHeaders = corsHeaders(
      {
        "content-type": tc.contentType ?? "text/plain",
        ...(tc.extraHeaders ?? {}),
      },
      requestId
    );
    if (tc.errorText) {
      return new Response(tc.errorText, { status: tc.status, headers: tcHeaders });
    }
    return new Response(tc.body ?? null, { status: tc.status, headers: tcHeaders });
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return new Response("Invalid upstream URL", {
      status: 400,
      headers: corsHeaders({ "content-type": "text/plain" }, requestId),
    });
  }

  const fwdHeaders = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v) fwdHeaders.set(name, v);
  }
  // Pick the UA most likely to keep this provider happy for this kind of
  // request (see comment near IPTV_UA_HLS / IPTV_UA_VOD).
  fwdHeaders.set("user-agent", type === "hls" ? IPTV_UA_HLS : IPTV_UA_VOD);
  // Some providers also check Referer / Origin. Spoof it as the upstream.
  fwdHeaders.set(
    "referer",
    `${upstreamUrl.protocol}//${upstreamUrl.host}/`
  );
  fwdHeaders.set("origin", `${upstreamUrl.protocol}//${upstreamUrl.host}`);

  let upstream: Response;
  const upstreamT0 = Date.now();
  try {
    upstream = await fetchUpstream(upstreamUrl.toString(), {
      method: head ? "HEAD" : "GET",
      headers: fwdHeaders,
      redirect: "follow",
      cache: "no-store",
      signal: req.signal,
    });
  } catch (err) {
    const durationMs = Date.now() - upstreamT0;
    maybeLogStreamUpstreamSlow({
      requestId,
      durationMs,
      streamType: type,
      upstreamHost: upstreamUrl.hostname,
      upstreamStatus: null,
    });
    /** Never forward raw Error.message in production — may contain URLs or upstream hints. */
    const detail =
      process.env.NODE_ENV !== "production" && err instanceof Error
        ? err.message
        : null;
    const body =
      detail != null ? `Upstream fetch failed: ${detail}` : "Upstream fetch failed.";
    return new Response(body, {
      status: 502,
      headers: corsHeaders({ "content-type": "text/plain" }, requestId),
    });
  }

  maybeLogStreamUpstreamSlow({
    requestId,
    durationMs: Date.now() - upstreamT0,
    streamType: type,
    upstreamHost: upstreamUrl.hostname,
    upstreamStatus: upstream.status,
  });

  const contentType = upstream.headers.get("content-type");
  const responseHeaders = corsHeaders({}, requestId);
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) responseHeaders.set(name, v);
  }

  // For HLS we may need to rewrite the manifest. CRITICAL: use the FINAL
  // URL after any redirects (`upstream.url`) as the base for resolving
  // relative segment URIs. Many IPTV providers 302 the m3u8 to a different
  // origin/CDN — segments are relative to *that* origin, not the original.
  if (
    type === "hls" &&
    (isManifest(contentType, upstreamUrl.pathname) ||
      isManifest(contentType, new URL(upstream.url).pathname))
  ) {
    if (head) {
      return new Response(null, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    const forCast = url.searchParams.get("cast") === "1";
    const cacheKey = manifestCacheKey({
      upstream: target,
      compatMse,
      forCast,
    });
    const cached = getCachedManifest(cacheKey);
    if (cached != null) {
      responseHeaders.set("content-type", "application/vnd.apple.mpegurl");
      responseHeaders.set("x-stream-manifest-cache", "hit");
      responseHeaders.delete("content-length");
      return new Response(cached, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    let text = await upstream.text();
    let finalManifestUrl: URL;
    try {
      finalManifestUrl = new URL(upstream.url);
    } catch {
      finalManifestUrl = upstreamUrl;
    }
    if (compatMse) {
      text = sanitizeTvMasterPlaylistIfNeeded(text);
    }
    const rewritten = rewriteHlsManifest(text, finalManifestUrl, {
      compatMse,
      forCast,
      proxyOrigin: forCast ? new URL(req.url).origin : undefined,
    });
    setCachedManifest(
      cacheKey,
      rewritten,
      type === "hls" ? LIVE_HLS_MANIFEST_CACHE_TTL_MS : undefined
    );
    responseHeaders.set("content-type", "application/vnd.apple.mpegurl");
    responseHeaders.set("x-stream-manifest-cache", "miss");
    responseHeaders.delete("content-length");
    return new Response(rewritten, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  if (head || !upstream.body) {
    return new Response(null, { status: upstream.status, headers: responseHeaders });
  }

  const body = passthroughStreamWithGracefulClose(upstream.body, req.signal);
  return new Response(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
