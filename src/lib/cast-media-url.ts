import {
  appendVodTranscodeHls,
  canVodTranscodeProxyUrl,
  isVodTranscodeEnabledClient,
  playbackUrlUsesVodTranscode,
  stripVodTranscodeParams,
  vodNeedsServerTranscodePrep,
  vodTranscodeBaseProxyUrl,
} from "@/lib/vod-transcode-url";
import {
  liveCastPlaylistLooksReady,
} from "@/lib/cast-live-hls";
import type { PlayerSource } from "@/store/player";

export type CastStreamKind = "live" | "buffered";

export type CastMediaDescriptor = {
  url: string;
  contentType: string;
  streamType: CastStreamKind;
};

export function toAbsoluteAppUrl(origin: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = origin.replace(/\/+$/, "");
  return `${base}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

/** Chromecast plays native HLS — never forward browser `compat=mse` ladder stripping. */
export function sanitizeProxyUrlForCast(
  proxyUrl: string,
  origin: string
): string {
  try {
    const parsed = new URL(proxyUrl, origin);
    parsed.searchParams.delete("compat");
    return `${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return proxyUrl;
  }
}

/** Tag proxied cast URLs so manifests can emit absolute segment URIs for receivers. */
export function appendCastStreamQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("cast", "1");
    parsed.searchParams.delete("compat");
    return parsed.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}cast=1`;
  }
}

/**
 * Poll the cast manifest the same way a Chromecast receiver would (no cookies).
 * Waits for transcode warm-up / 503 retry cycles before sender loadMedia().
 */
export async function waitForCastPlaylistReady(
  manifestUrl: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) {
      throw new Error("Cast preparation cancelled.");
    }
    attempt += 1;
    const res = await fetch(manifestUrl, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: opts?.signal,
    });
    if (res.ok) {
      const text = await res.text();
      if (liveCastPlaylistLooksReady(text)) return;
    }
    const retryAfterSec = parseInt(res.headers.get("retry-after") ?? "", 10);
    const waitMs =
      res.status === 503 && Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(8000, retryAfterSec * 1000)
        : Math.min(4000, 600 + attempt * 250);
    await new Promise((r) => window.setTimeout(r, waitMs));
  }
  throw new Error("Timed out preparing stream for your TV.");
}

/**
 * Build a Chromecast-safe media URL: same-origin proxy (correct upstream UA),
 * HLS transcode for MKV/HEVC, never raw provider URLs.
 */
export function buildCastMediaDescriptor(opts: {
  origin: string;
  current: PlayerSource;
  isLive: boolean;
  /** Active browser playback URL (`current.url` or transcode override). */
  proxyPlaybackUrl: string;
  /** Resume VOD transcode near this position (seconds). */
  seekSec?: number;
}): CastMediaDescriptor | null {
  const { origin, current, isLive, proxyPlaybackUrl, seekSec } = opts;
  if (!origin || !proxyPlaybackUrl) return null;

  let proxyPath = proxyPlaybackUrl;
  let usesTranscode = playbackUrlUsesVodTranscode(proxyPlaybackUrl);

  if (!isLive && isVodTranscodeEnabledClient()) {
    const needsTranscode =
      usesTranscode ||
      (vodNeedsServerTranscodePrep(current.containerExt, current.url) &&
        canVodTranscodeProxyUrl(current.url));
    if (needsTranscode) {
      const base =
        vodTranscodeBaseProxyUrl(proxyPlaybackUrl) ??
        vodTranscodeBaseProxyUrl(current.url) ??
        stripVodTranscodeParams(current.url);
      const seek =
        seekSec != null && seekSec > 2 ? Math.floor(seekSec) : undefined;
      proxyPath = appendVodTranscodeHls(base, { seekSec: seek });
      usesTranscode = true;
    }
  }

  proxyPath = sanitizeProxyUrlForCast(proxyPath, origin);

  const absolute = appendCastStreamQuery(
    toAbsoluteAppUrl(origin, proxyPath)
  );

  if (isLive) {
    return {
      url: absolute,
      contentType: "application/vnd.apple.mpegurl",
      streamType: "live",
    };
  }

  const hls =
    usesTranscode ||
    /\.m3u8($|[?#])/i.test(proxyPath) ||
    current.containerExt?.toLowerCase() === "m3u8";

  if (hls) {
    return {
      url: absolute,
      contentType: "application/x-mpegURL",
      // In-progress server transcode playlists are EVENT-style — receivers need LIVE.
      streamType: usesTranscode ? "live" : "buffered",
    };
  }

  const ext = (current.containerExt || "mp4").toLowerCase();
  const contentType =
    ext === "mkv"
      ? "video/x-matroska"
      : ext === "webm"
        ? "video/webm"
        : "video/mp4";

  return {
    url: absolute,
    contentType,
    streamType: "buffered",
  };
}
