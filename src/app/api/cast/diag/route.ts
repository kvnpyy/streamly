import {
  appendCastStreamQuery,
  toAbsoluteAppUrl,
} from "@/lib/cast-media-url";
import {
  isLiveHlsMasterPlaylist,
  isLiveHlsMediaPlaylist,
  liveCastPlaylistLooksReady,
} from "@/lib/cast-live-hls";
import {
  isSameOriginStreamProxyUrl,
  resolveLiveCastPlayUrlServer,
} from "@/lib/cast-resolve-server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECEIVER_UA =
  "Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit/537.36 CrKey/1.56.500000 GoogleCast";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function metricsSecret(): string | null {
  const s = process.env.CAPACITY_METRICS_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

async function probeUrl(
  url: string,
  userAgent: string,
  signal?: AbortSignal
): Promise<{
  status: number;
  ok: boolean;
  contentType: string | null;
  looksReady?: boolean;
  isMaster?: boolean;
  isMedia?: boolean;
  firstSegmentStatus?: number | null;
}> {
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
    signal,
    headers: {
      accept: "*/*",
      "user-agent": userAgent,
    },
  });
  const contentType = res.headers.get("content-type");
  if (!res.ok) {
    return { status: res.status, ok: false, contentType };
  }
  const text = await res.text();
  const looksReady = liveCastPlaylistLooksReady(text);
  const isMaster = isLiveHlsMasterPlaylist(text);
  const isMedia = isLiveHlsMediaPlaylist(text);

  let firstSegmentStatus: number | null = null;
  if (isMedia || looksReady) {
    const segLine = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#") && /\.(ts|m4s|aac|mp4)(\?|$)/i.test(l));
    if (segLine) {
      try {
        const segUrl = /^https?:\/\//i.test(segLine)
          ? segLine
          : new URL(segLine, url).toString();
        const segRes = await fetch(segUrl, {
          method: "GET",
          headers: {
            range: "bytes=0-1023",
            "user-agent": userAgent,
          },
          cache: "no-store",
          redirect: "follow",
          signal,
        });
        firstSegmentStatus = segRes.status;
      } catch {
        firstSegmentStatus = null;
      }
    }
  }

  return {
    status: res.status,
    ok: true,
    contentType,
    looksReady,
    isMaster,
    isMedia,
    firstSegmentStatus,
  };
}

/**
 * Token-gated cast diagnostics for support / ops.
 * GET /api/cast/diag?url=<same-origin-/api/stream-url>&token=…
 * Auth: CAPACITY_METRICS_SECRET via Bearer or ?token=
 */
export async function GET(req: NextRequest) {
  const secret = metricsSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "diag_disabled" },
      { status: 503 }
    );
  }
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = req.nextUrl.searchParams.get("token") ?? bearer;
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const raw = req.nextUrl.searchParams.get("url")?.trim();
  if (!raw) {
    return NextResponse.json(
      { ok: false, error: "Missing url parameter." },
      { status: 400 }
    );
  }

  const castUrl = appendCastStreamQuery(
    /^https?:\/\//i.test(raw) ? raw : toAbsoluteAppUrl(origin, raw)
  );
  if (!isSameOriginStreamProxyUrl(castUrl, origin)) {
    return NextResponse.json(
      { ok: false, error: "Only same-origin /api/stream URLs are allowed." },
      { status: 400 }
    );
  }

  let playUrl: string | null = null;
  let resolveError: string | null = null;
  try {
    playUrl = await resolveLiveCastPlayUrlServer(castUrl, {
      origin,
      signal: req.signal,
    });
  } catch (err) {
    resolveError =
      err instanceof Error && err.message
        ? err.message
        : "resolve_failed";
  }

  const target = playUrl ?? castUrl;
  const [browser, receiver] = await Promise.all([
    probeUrl(target, BROWSER_UA, req.signal).catch((e) => ({
      status: 0,
      ok: false as const,
      contentType: null,
      error: e instanceof Error ? e.message : "probe_failed",
    })),
    probeUrl(target, RECEIVER_UA, req.signal).catch((e) => ({
      status: 0,
      ok: false as const,
      contentType: null,
      error: e instanceof Error ? e.message : "probe_failed",
    })),
  ]);

  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    inputUrlHostPath: (() => {
      try {
        const u = new URL(castUrl);
        return `${u.origin}${u.pathname}`;
      } catch {
        return null;
      }
    })(),
    resolve: {
      ok: Boolean(playUrl),
      error: resolveError,
      playUrlHostPath: playUrl
        ? (() => {
            try {
              const u = new URL(playUrl);
              return `${u.origin}${u.pathname}?type=${u.searchParams.get("type")}&cast=${u.searchParams.get("cast")}`;
            } catch {
              return null;
            }
          })()
        : null,
    },
    browserProbe: browser,
    receiverProbe: receiver,
    hints: [
      !playUrl && "Resolve failed — master may be HEVC-only or unreachable.",
      browser &&
        "ok" in browser &&
        browser.ok &&
        browser.isMaster &&
        "Resolved URL is still a master playlist — Chromecast will stall on title.",
      receiver &&
        "firstSegmentStatus" in receiver &&
        receiver.firstSegmentStatus != null &&
        receiver.firstSegmentStatus >= 400 &&
        `Receiver segment fetch returned ${receiver.firstSegmentStatus} — provider/UA block likely.`,
      browser &&
        "firstSegmentStatus" in browser &&
        receiver &&
        "firstSegmentStatus" in receiver &&
        browser.firstSegmentStatus != null &&
        browser.firstSegmentStatus < 400 &&
        receiver.firstSegmentStatus != null &&
        receiver.firstSegmentStatus >= 400 &&
        "Browser can fetch segments but Chromecast UA cannot — check UA allowlist / upstream.",
    ].filter(Boolean),
  });
}
