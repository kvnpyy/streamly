import {
  appendCastStreamQuery,
  waitForCastPlaylistReady,
  type CastMediaDescriptor,
  type CastStreamKind,
} from "@/lib/cast-media-url";
import { resolveCastLiveHlsUrl } from "@/lib/cast-live-hls";

export type CastPreparedMedia = {
  playUrl: string;
  contentType: string;
  streamType: CastStreamKind;
  /** Descriptor URL this prep was built from (invalidation key). */
  sourceUrl: string;
  preparedAt: number;
  /** How the live URL was resolved (for telemetry). */
  resolvePath?: "server" | "client" | "vod" | "direct";
};

export const CAST_PREP_FRESH_MS = 90_000;

export function isCastPreparedMediaFresh(
  prepared: CastPreparedMedia | null | undefined,
  sourceUrl: string,
  now = Date.now()
): prepared is CastPreparedMedia {
  if (!prepared) return false;
  if (prepared.sourceUrl !== sourceUrl) return false;
  return now - prepared.preparedAt < CAST_PREP_FRESH_MS;
}

/**
 * Resolve + warm the exact URL Chromecast will loadMedia().
 * Live: always walk from the master cast URL to a cast-safe media playlist.
 * Never reuse the browser's active hls.js level — that rung is often HEVC/Dolby
 * that Chromecast's default receiver cannot decode (title + icon, no video).
 */
export async function prepareCastPlayUrl(
  castMedia: CastMediaDescriptor,
  opts?: {
    origin?: string;
    signal?: AbortSignal;
    /** Prefer server resolve for live masters (falls back to client walk). */
    resolveLiveViaServer?: (manifestUrl: string) => Promise<string>;
    timeoutMs?: number;
  }
): Promise<CastPreparedMedia> {
  if (castMedia.blockedReason) {
    throw new Error(castMedia.blockedReason);
  }

  let playUrl = castMedia.url;
  let resolvePath: CastPreparedMedia["resolvePath"] = "direct";

  const isHls =
    /mpegurl/i.test(castMedia.contentType) ||
    /\.m3u8($|[?#])/i.test(castMedia.url);
  /** Live TV masters need variant resolution; VOD HLS/transcode only needs readiness. */
  const isLiveChannel =
    isHls && castMedia.contentType === "application/vnd.apple.mpegurl";

  if (isLiveChannel) {
    playUrl = appendCastStreamQuery(castMedia.url);
    if (opts?.resolveLiveViaServer) {
      try {
        playUrl = await opts.resolveLiveViaServer(playUrl);
        resolvePath = "server";
      } catch {
        playUrl = await resolveCastLiveHlsUrl(playUrl, {
          signal: opts?.signal,
        });
        resolvePath = "client";
      }
    } else {
      playUrl = await resolveCastLiveHlsUrl(playUrl, {
        signal: opts?.signal,
      });
      resolvePath = "client";
    }
    playUrl = appendCastStreamQuery(playUrl);
    await waitForCastPlaylistReady(playUrl, {
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs ?? 45_000,
    });
  } else if (isHls) {
    playUrl = appendCastStreamQuery(playUrl);
    resolvePath = "vod";
    await waitForCastPlaylistReady(playUrl, {
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs ?? 45_000,
    });
  } else {
    playUrl = appendCastStreamQuery(playUrl);
    resolvePath = "direct";
  }

  return {
    playUrl,
    contentType: castMedia.contentType,
    streamType: castMedia.streamType,
    sourceUrl: castMedia.url,
    preparedAt: Date.now(),
    resolvePath,
  };
}

/** Client helper: ask `/api/cast/resolve` for a single media-playlist cast URL. */
export async function resolveLiveCastUrlViaServer(
  manifestUrl: string,
  opts?: { signal?: AbortSignal; origin?: string }
): Promise<string> {
  const origin =
    opts?.origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const endpoint = new URL("/api/cast/resolve", origin || "http://localhost");
  endpoint.searchParams.set("url", manifestUrl);
  const res = await fetch(endpoint.toString(), {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    signal: opts?.signal,
  });
  if (!res.ok) {
    let message = `Cast resolve failed (${res.status}).`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error?.trim()) message = data.error.trim();
    } catch {
      const text = await res.text().catch(() => "");
      if (text.trim()) message = text.trim();
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { playUrl?: string };
  if (!data.playUrl || typeof data.playUrl !== "string") {
    throw new Error("Cast resolve returned no playable URL.");
  }
  return data.playUrl;
}
