import {
  appendCastStreamQuery,
  toAbsoluteAppUrl,
} from "@/lib/cast-media-url";
import {
  isLiveHlsMasterPlaylist,
  isLiveHlsMediaPlaylist,
  pickChromecastLiveVariant,
  resolveVariantUrl,
} from "@/lib/cast-live-hls";
import { parseMasterPlaylistLines } from "@/lib/hls-manifest-tv-sanitize";

/** Must pass `/api/stream` UA gate (Mozilla/… browsers + Chromecast). */
const RESOLVE_FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function isSameOriginStreamProxyUrl(
  candidate: string,
  origin: string
): boolean {
  try {
    const parsed = new URL(candidate, origin);
    const base = new URL(origin);
    if (parsed.origin !== base.origin) return false;
    return parsed.pathname === "/api/stream" || parsed.pathname.startsWith("/api/stream/");
  } catch {
    return false;
  }
}

/**
 * Server-side live cast resolve: walk master playlists to a single
 * Chromecast-safe media-playlist proxy URL (`cast=1`).
 */
export async function resolveLiveCastPlayUrlServer(
  castManifestUrl: string,
  opts: {
    origin: string;
    signal?: AbortSignal;
    maxDepth?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<string> {
  const { origin, signal } = opts;
  const maxDepth = opts.maxDepth ?? 4;
  const fetchFn = opts.fetchImpl ?? fetch;

  let url = appendCastStreamQuery(
    /^https?:\/\//i.test(castManifestUrl)
      ? castManifestUrl
      : toAbsoluteAppUrl(origin, castManifestUrl)
  );

  if (!isSameOriginStreamProxyUrl(url, origin)) {
    throw new Error(
      "Cast resolve only accepts same-origin /api/stream URLs."
    );
  }

  for (let depth = 0; depth < maxDepth; depth++) {
    const res = await fetchFn(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal,
      headers: {
        accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
        "user-agent": RESOLVE_FETCH_UA,
      },
    });
    if (!res.ok) {
      throw new Error(`Could not load live stream manifest (${res.status}).`);
    }
    const text = await res.text();
    if (isLiveHlsMediaPlaylist(text)) {
      return appendCastStreamQuery(url);
    }
    if (!isLiveHlsMasterPlaylist(text)) {
      if (/#EXTINF:/i.test(text)) {
        return appendCastStreamQuery(url);
      }
      throw new Error(
        "This channel’s stream format is not ready for Chromecast yet."
      );
    }

    const parts = parseMasterPlaylistLines(text.split(/\r?\n/));
    const picked = pickChromecastLiveVariant(parts.variants);
    if (!picked) {
      throw new Error(
        "This channel uses video or audio Chromecast cannot decode (often HEVC or Dolby)."
      );
    }
    const next = resolveVariantUrl(picked.uri, url);
    url = appendCastStreamQuery(
      /^https?:\/\//i.test(next) ? next : toAbsoluteAppUrl(origin, next)
    );
    if (!isSameOriginStreamProxyUrl(url, origin)) {
      // Variant should already be rewritten to /api/stream when cast=1.
      // If upstream leaked a raw CDN URL, wrap it.
      try {
        const abs = new URL(next, url).toString();
        url = appendCastStreamQuery(
          toAbsoluteAppUrl(
            origin,
            `/api/stream?u=${encodeURIComponent(abs)}&type=hls`
          )
        );
      } catch {
        throw new Error("Could not resolve a same-origin cast playlist URL.");
      }
    }
  }

  throw new Error(
    "Could not resolve a playable stream for your TV (master playlist only)."
  );
}
