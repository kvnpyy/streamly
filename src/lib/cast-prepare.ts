import {
  appendCastStreamQuery,
  normalizeCastLiveManifestUrl,
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
 * Live: media playlist only. VOD: wait until HLS/transcode playlist has segments.
 */
export async function prepareCastPlayUrl(
  castMedia: CastMediaDescriptor,
  opts?: {
    origin?: string;
    getLiveHlsManifestUrl?: () => string | null;
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
  const origin =
    opts?.origin ??
    (typeof window !== "undefined" ? window.location.origin : "");

  const isHls =
    /mpegurl/i.test(castMedia.contentType) ||
    /\.m3u8($|[?#])/i.test(castMedia.url);
  /** Live TV masters need variant resolution; VOD HLS/transcode only needs readiness. */
  const isLiveChannel =
    isHls && castMedia.contentType === "application/vnd.apple.mpegurl";

  if (isLiveChannel) {
    const levelUrl = opts?.getLiveHlsManifestUrl?.() ?? null;
    if (levelUrl && origin) {
      playUrl = normalizeCastLiveManifestUrl(origin, levelUrl);
    }
    if (opts?.resolveLiveViaServer) {
      try {
        playUrl = await opts.resolveLiveViaServer(playUrl);
      } catch {
        playUrl = await resolveCastLiveHlsUrl(playUrl, {
          signal: opts?.signal,
        });
      }
    } else {
      playUrl = await resolveCastLiveHlsUrl(playUrl, {
        signal: opts?.signal,
      });
    }
    playUrl = appendCastStreamQuery(playUrl);
    await waitForCastPlaylistReady(playUrl, {
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs ?? 45_000,
    });
  } else if (isHls) {
    playUrl = appendCastStreamQuery(playUrl);
    await waitForCastPlaylistReady(playUrl, {
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs ?? 45_000,
    });
  } else {
    playUrl = appendCastStreamQuery(playUrl);
  }

  return {
    playUrl,
    contentType: castMedia.contentType,
    streamType: castMedia.streamType,
    sourceUrl: castMedia.url,
    preparedAt: Date.now(),
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
    const text = await res.text().catch(() => "");
    throw new Error(
      text.trim() || `Cast resolve failed (${res.status}).`
    );
  }
  const data = (await res.json()) as { playUrl?: string };
  if (!data.playUrl || typeof data.playUrl !== "string") {
    throw new Error("Cast resolve returned no playable URL.");
  }
  return data.playUrl;
}
