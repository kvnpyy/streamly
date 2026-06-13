export const VOD_TRANSCODE_SEGMENT_RE = /^seg_\d+\.ts$/i;

const DURATION_TAG_RE = /^#EXT-X-STREAMLY-DURATION-SEC:([\d.]+)/im;
const START_OFFSET_TAG_RE = /^#EXT-X-STREAMLY-START-OFFSET-SEC:([\d.]+)/im;
const ENCODED_DURATION_TAG_RE =
  /^#EXT-X-STREAMLY-ENCODED-DURATION-SEC:([\d.]+)/im;

/** While ffmpeg is still running, cap playlist size so Safari/hls.js don't choke on huge m3u8. */
/** ~60 min @ 4s segments — avoids truncating hour-long episodes while ffmpeg is still running. */
export const MAX_IN_PROGRESS_PLAYLIST_SEGMENTS = 900;

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

function segmentSequence(name: string): number | null {
  const m = name.match(/^seg_(\d+)\.ts$/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when ffmpeg's m3u8 lists missing segments or sequence holes on disk.
 * Do not compare against the playback-trimmed manifest (900-seg cap) — that
 * false-positive would kill ffmpeg on every manifest poll.
 */
export function manifestReferencesMissingOrGappedSegments(
  manifestText: string,
  onDisk: ReadonlySet<string>
): boolean {
  let expect: number | null = null;
  let pendingInf = false;
  for (const line of manifestText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXTINF")) {
      pendingInf = true;
      continue;
    }
    if (!pendingInf || !trimmed || trimmed.startsWith("#")) {
      pendingInf = false;
      continue;
    }
    pendingInf = false;
    const name = segmentNameFromPlaylistLine(trimmed);
    if (!name) continue;
    const seq = segmentSequence(name);
    if (seq == null) continue;
    if (!onDisk.has(name)) return true;
    if (expect == null) expect = seq;
    if (seq !== expect) return true;
    expect += 1;
  }
  return false;
}

/** True when seg_00029+ exists but the prefix 0..N-1 is broken or incomplete. */
export function hasOrphanSegmentsBeyondPrefix(
  files: ReadonlySet<string>
): boolean {
  const prefix = contiguousSegmentCount(files);
  for (const name of files) {
    const seq = segmentSequence(name);
    if (seq !== null && seq >= prefix) return true;
  }
  return false;
}

/** How many segments exist on disk starting at seg_00000 with no gaps. */
export function contiguousSegmentCount(
  files: ReadonlySet<string>
): number {
  let expect = 0;
  const nums = [...files]
    .map((f) => segmentSequence(f))
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
  for (const n of nums) {
    if (n === expect) expect++;
    else break;
  }
  return expect;
}

/** Drop gaps (e.g. from crashed duplicate ffmpeg) so hls.js never 404s mid-playlist. */
/** Parse #EXTINF durations keyed by segment filename from an ffmpeg m3u8. */
export function parseExtinfDurationsBySegment(
  manifestText: string
): Map<string, number> {
  const out = new Map<string, number>();
  let pending: number | null = null;
  for (const line of manifestText.split(/\r?\n/)) {
    const trimmed = line.trim();
    const inf = trimmed.match(/^#EXTINF:([\d.]+)/i);
    if (inf) {
      const n = parseFloat(inf[1]!);
      pending = Number.isFinite(n) && n > 0 ? n : null;
      continue;
    }
    const name = segmentNameFromPlaylistLine(line);
    if (name && pending != null) {
      out.set(name, pending);
      pending = null;
    }
  }
  return out;
}

export function countManifestSegments(manifestText: string): number {
  let n = 0;
  for (const line of manifestText.split(/\r?\n/)) {
    if (segmentNameFromPlaylistLine(line)) n += 1;
  }
  return n;
}

/**
 * Build a contiguous playlist from on-disk segments when ffmpeg's index.m3u8 lags
 * behind flushed .ts files (common during provider read stalls).
 */
export function buildManifestFromContiguousDisk(
  onDisk: ReadonlySet<string>,
  durationBySegment: ReadonlyMap<string, number>,
  defaultSegSec: number
): string {
  const prefix = contiguousSegmentCount(onDisk);
  if (prefix <= 0) return "#EXTM3U\n";
  const targetDur = Math.max(2, Math.ceil(defaultSegSec));
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:6",
    `#EXT-X-TARGETDURATION:${targetDur}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];
  for (let i = 0; i < prefix; i++) {
    const name = `seg_${String(i).padStart(5, "0")}.ts`;
    if (!onDisk.has(name)) break;
    const dur = durationBySegment.get(name) ?? defaultSegSec;
    lines.push(`#EXTINF:${dur.toFixed(6)},`, name);
  }
  return lines.join("\n");
}

export function trimContiguousSegmentsFromStart<
  T extends { extinf: string; media: string },
>(pairs: T[]): T[] {
  if (pairs.length === 0) return pairs;
  const out: T[] = [];
  let expect: number | null = null;
  for (const pair of pairs) {
    const name = segmentNameFromPlaylistLine(pair.media);
    if (!name) continue;
    const seq = segmentSequence(name);
    if (seq == null) continue;
    if (expect == null) expect = seq;
    if (seq !== expect) break;
    out.push(pair);
    expect += 1;
  }
  return out;
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
  const pairs: { extinf: string; media: string; discontinuity?: boolean }[] =
    [];
  let pendingExtinf: string | null = null;
  let pendingDisc = false;

  const canIncludeSegment = (mediaLine: string): boolean => {
    const name = segmentNameFromPlaylistLine(mediaLine);
    if (!name) return false;
    if (existingSegments && !existingSegments.has(name)) return false;
    return true;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#EXT-X-DISCONTINUITY/i.test(trimmed)) {
      pendingDisc = true;
      continue;
    }

    if (trimmed.startsWith("#EXTINF")) {
      pendingExtinf = line;
      continue;
    }

    if (pendingExtinf && trimmed && !trimmed.startsWith("#")) {
      if (canIncludeSegment(line)) {
        pairs.push({
          extinf: pendingExtinf,
          media: line,
          discontinuity: pendingDisc,
        });
        pendingDisc = false;
      }
      pendingExtinf = null;
      continue;
    }

    pendingExtinf = null;
    if (!playlistComplete && /^#EXT-X-ENDLIST/i.test(trimmed)) continue;
    if (trimmed.startsWith("#")) header.push(line);
  }

  let kept = trimContiguousSegmentsFromStart(pairs);
  if (!playlistComplete && kept.length > MAX_IN_PROGRESS_PLAYLIST_SEGMENTS) {
    /** Keep from the start — VOD transcode always plays forward from seg_00000. */
    kept = kept.slice(0, MAX_IN_PROGRESS_PLAYLIST_SEGMENTS);
  }

  const out = [...header];
  for (const p of kept) {
    if (p.discontinuity) out.push("#EXT-X-DISCONTINUITY");
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
  const streamlyTags: string[] = [];
  if (opts?.playlistComplete) {
    streamlyTags.push("#EXT-X-PLAYLIST-TYPE:VOD");
  } else {
    streamlyTags.push("#EXT-X-PLAYLIST-TYPE:EVENT");
  }
  const off = opts?.startOffsetSec ?? 0;
  if (off > 0) streamlyTags.push(`#EXT-X-STREAMLY-START-OFFSET-SEC:${off}`);
  const enc = opts?.encodedDurationSec;
  if (enc != null && enc > 0) {
    streamlyTags.push(`#EXT-X-STREAMLY-ENCODED-DURATION-SEC:${enc.toFixed(3)}`);
  }
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

  if (streamlyTags.length === 0) return body;

  const lines = body.split(/\r?\n/);
  const extm3uIdx = lines.findIndex((l) => l.trim() === "#EXTM3U");
  if (extm3uIdx >= 0) {
    lines.splice(extm3uIdx + 1, 0, ...streamlyTags);
    return lines.join("\n");
  }
  return ["#EXTM3U", ...streamlyTags, body].join("\n");
}
