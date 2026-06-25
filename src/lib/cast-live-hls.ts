import {
  codecsFromStreamInf,
  codecsLooksDolbyDigital,
  codecsLooksHevc,
  parseMasterPlaylistLines,
  type MasterParts,
} from "@/lib/hls-manifest-tv-sanitize";

function bandwidthFromStreamInf(streamInfLine: string): number {
  const m = /BANDWIDTH=(\d+)/i.exec(streamInfLine);
  if (!m) return 0;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Pick an H.264 / AAC-friendly rung for Google Cast receivers. */
export function pickChromecastLiveVariant(
  variants: MasterParts["variants"]
): MasterParts["variants"][number] | null {
  if (variants.length === 0) return null;

  const scored = variants
    .map((v) => {
      const codecs = codecsFromStreamInf(v.inf);
      let score = 1000;
      if (codecsLooksHevc(codecs)) score -= 800;
      if (codecsLooksDolbyDigital(codecs)) score -= 400;
      const bw = bandwidthFromStreamInf(v.inf);
      if (bw > 0) {
        // Prefer a stable mid-tier rung — not the heaviest 4K ladder.
        const mbps = bw / 1_000_000;
        score -= Math.abs(mbps - 3) * 40;
      }
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 200) return null;
  return best.v;
}

export function isLiveHlsMasterPlaylist(text: string): boolean {
  return text.includes("#EXT-X-STREAM-INF");
}

/** True when the text is a single media playlist Chromecast can play (not a master). */
export function isLiveHlsMediaPlaylist(text: string): boolean {
  if (!/#EXTM3U/i.test(text)) return false;
  if (/#EXT-X-STREAM-INF/i.test(text)) return false;
  if (!/#EXTINF:/i.test(text)) return false;
  return /\.(ts|m4s|aac|mp4)(\?|$|\s|")/im.test(text);
}

export function resolveVariantUrl(
  variantUri: string,
  manifestUrl: string
): string {
  const trimmed = variantUri.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return new URL(trimmed, manifestUrl).toString();
}

/**
 * Live IPTV feeds are usually master playlists. Chromecast often stalls on the
 * master (logo only) or auto-selects HEVC/Dolby rungs it cannot decode.
 * Resolve to a single cast-safe media-playlist URL before loadMedia().
 */
export async function resolveCastLiveHlsUrl(
  castManifestUrl: string,
  opts?: { signal?: AbortSignal; maxDepth?: number }
): Promise<string> {
  const maxDepth = opts?.maxDepth ?? 4;
  let url = castManifestUrl;

  for (let depth = 0; depth < maxDepth; depth++) {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: opts?.signal,
    });
    if (!res.ok) {
      throw new Error(`Could not load live stream manifest (${res.status}).`);
    }
    const text = await res.text();
    if (isLiveHlsMediaPlaylist(text)) {
      return url;
    }
    if (!isLiveHlsMasterPlaylist(text)) {
      if (/#EXTINF:/i.test(text)) {
        return url;
      }
      throw new Error(
        "This channel’s stream format is not ready for Chromecast yet. Try again in a moment."
      );
    }

    const parts = parseMasterPlaylistLines(text.split(/\r?\n/));
    const picked = pickChromecastLiveVariant(parts.variants);
    if (!picked) {
      throw new Error(
        "This channel uses video or audio Chromecast cannot decode (often HEVC or Dolby). Try another channel or copy the stream URL for your provider app."
      );
    }
    url = resolveVariantUrl(picked.uri, url);
  }

  const finalRes = await fetch(url, {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    signal: opts?.signal,
  });
  if (!finalRes.ok) {
    throw new Error(`Could not load live stream manifest (${finalRes.status}).`);
  }
  const finalText = await finalRes.text();
  if (isLiveHlsMasterPlaylist(finalText)) {
    throw new Error(
      "Could not resolve a playable stream for your TV (master playlist only). Try another channel."
    );
  }
  if (!isLiveHlsMediaPlaylist(finalText) && !/#EXTINF:/i.test(finalText)) {
    throw new Error(
      "Stream playlist is not ready for your TV yet. Wait a moment and try again."
    );
  }
  return url;
}

export function liveCastPlaylistLooksReady(text: string): boolean {
  return isLiveHlsMediaPlaylist(text);
}
