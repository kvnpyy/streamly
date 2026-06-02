export const VOD_TRANSCODE_SEGMENT_RE = /^seg_\d+\.ts$/i;

const DURATION_TAG_RE = /^#EXT-X-STREAMLY-DURATION-SEC:([\d.]+)/im;
const START_OFFSET_TAG_RE = /^#EXT-X-STREAMLY-START-OFFSET-SEC:([\d.]+)/im;
const ENCODED_DURATION_TAG_RE =
  /^#EXT-X-STREAMLY-ENCODED-DURATION-SEC:([\d.]+)/im;

/** While ffmpeg is still running, cap playlist size so Safari/hls.js don't choke on huge m3u8. */
export const MAX_IN_PROGRESS_PLAYLIST_SEGMENTS = 360;

export function sumExtinfDurationSec(manifestText: string): number {
  let sum = 0;
  for (const line of manifestText.split(/\r?\n/)) {
    const m = line.trim().match(/^#EXTINF:([\d.]+)/i);
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n) && n > 0) sum += n;
    }
  }
  return sum;
}

export function segmentNameFromPlaylistLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const base = trimmed.split("/").pop() || trimmed;
  return VOD_TRANSCODE_SEGMENT_RE.test(base) ? base : null;
}

/**
 * Strip discontinuity tags, cap length, and **only include segments that exist on disk**
 * so hls.js never 404s on entries ffmpeg listed before the .ts file was flushed.
 */
export function prepareManifestForPlayback(
  text: string,
  playlistComplete: boolean,
  existingSegments?: ReadonlySet<string>
): string {
  const lines = text.split(/\r?\n/);
  const header: string[] = [];
  const pairs: { extinf: string; media: string }[] = [];
  let pendingExtinf: string | null = null;

  const canIncludeSegment = (mediaLine: string): boolean => {
    const name = segmentNameFromPlaylistLine(mediaLine);
    if (!name) return false;
    if (existingSegments && !existingSegments.has(name)) return false;
    return true;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#EXT-X-DISCONTINUITY/i.test(trimmed)) continue;

    if (trimmed.startsWith("#EXTINF")) {
      pendingExtinf = line;
      continue;
    }

    if (pendingExtinf && trimmed && !trimmed.startsWith("#")) {
      if (canIncludeSegment(line)) {
        pairs.push({ extinf: pendingExtinf, media: line });
      }
      pendingExtinf = null;
      continue;
    }

    pendingExtinf = null;
    if (!playlistComplete && /^#EXT-X-ENDLIST/i.test(trimmed)) continue;
    if (trimmed.startsWith("#")) header.push(line);
  }

  let kept = pairs;
  if (!playlistComplete && pairs.length > MAX_IN_PROGRESS_PLAYLIST_SEGMENTS) {
    /** Keep the tail so playback can advance with ffmpeg; full list when complete. */
    kept = pairs.slice(-MAX_IN_PROGRESS_PLAYLIST_SEGMENTS);
  }

  const out = [...header];
  for (const p of kept) {
    out.push(p.extinf, p.media);
  }
  if (playlistComplete) out.push("#EXT-X-ENDLIST");
  return out.join("\n");
}

function parseTag(
  manifestText: string,
  re: RegExp
): number | null {
  const m = manifestText.match(re);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseStreamlyDurationSec(manifestText: string): number | null {
  const n = parseTag(manifestText, DURATION_TAG_RE);
  return n != null && n > 0 ? n : null;
}

export function parseStreamlyStartOffsetSec(manifestText: string): number | null {
  return parseTag(manifestText, START_OFFSET_TAG_RE);
}

export function parseStreamlyEncodedDurationSec(
  manifestText: string
): number | null {
  const n = parseTag(manifestText, ENCODED_DURATION_TAG_RE);
  return n != null && n > 0 ? n : null;
}

export function rewriteTranscodeManifest(
  text: string,
  upstream: string,
  compatMse: boolean,
  opts?: {
    durationSec?: number | null;
    playlistComplete?: boolean;
    startOffsetSec?: number;
    encodedDurationSec?: number | null;
    forCast?: boolean;
    proxyOrigin?: string;
  }
): string {
  const compatQs = compatMse ? "&compat=mse" : "";
  const seekQs =
    opts?.startOffsetSec && opts.startOffsetSec > 0
      ? `&tc_seek=${Math.floor(opts.startOffsetSec)}`
      : "";
  const castQs = opts?.forCast ? "&cast=1" : "";
  const originPrefix = opts?.proxyOrigin?.replace(/\/+$/, "") ?? "";
  const baseQs = `u=${encodeURIComponent(upstream)}&type=vod&transcode=hls${compatQs}${seekQs}${castQs}`;
  const tags: string[] = [];
  if (opts?.playlistComplete) tags.push("#EXT-X-PLAYLIST-TYPE:VOD");
  const off = opts?.startOffsetSec ?? 0;
  if (off > 0) tags.push(`#EXT-X-STREAMLY-START-OFFSET-SEC:${off}`);
  const enc = opts?.encodedDurationSec;
  if (enc != null && enc > 0) {
    tags.push(`#EXT-X-STREAMLY-ENCODED-DURATION-SEC:${enc.toFixed(3)}`);
  }
  const headerPrefix = tags.length ? `${tags.join("\n")}\n` : "";
  const body = text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const media = trimmed.split("/").pop() || trimmed;
      if (
        !VOD_TRANSCODE_SEGMENT_RE.test(media) &&
        !media.endsWith(".m3u8")
      ) {
        return line;
      }
      const rel = `/api/stream?${baseQs}&media=${encodeURIComponent(media)}`;
      return originPrefix ? `${originPrefix}${rel}` : rel;
    })
    .join("\n");
  return headerPrefix + body;
}
