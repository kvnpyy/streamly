export const VOD_TRANSCODE_SEGMENT_RE = /^seg_\d+\.ts$/i;

const DURATION_TAG_RE = /^#EXT-X-STREAMLY-DURATION-SEC:([\d.]+)/im;
const START_OFFSET_TAG_RE = /^#EXT-X-STREAMLY-START-OFFSET-SEC:([\d.]+)/im;
const ENCODED_DURATION_TAG_RE =
  /^#EXT-X-STREAMLY-ENCODED-DURATION-SEC:([\d.]+)/im;

/** While ffmpeg is still running, cap playlist size so Safari/hls.js don't choke on huge m3u8. */
/**
 * ~5h @ 4s segments. The old 900 (~60m) cap froze long movies at the EVENT tip
 * even when disk had more segments — playhead stalled, Try again wiped the encode.
 */
export const MAX_IN_PROGRESS_PLAYLIST_SEGMENTS = 4500;

/**
 * Hide the freshest N segments while ffmpeg is still writing. Clients that race the
 * encode edge get 503/404 holes; hls.js then jumps ~1s (`maxBufferHole`) and playback
 * "skips". Holdback keeps the published playlist a few seconds behind disk.
 */
export const IN_PROGRESS_ENCODE_EDGE_HOLDBACK = 2;

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

/**
 * Resume ffmpeg input offset after a contiguous disk prefix.
 * Empty/corrupt m3u8 must not yield seek=startOffset with start_number=N — that
 * re-encodes from the job start into segment N and freezes the tip (~14 min here).
 */
export function resumeSeekSecForDiskPrefix(opts: {
  startOffsetSec: number;
  prefixCount: number;
  segmentSec: number;
  /** Duration from a usable playlist; ignored when below the disk floor. */
  manifestEncodedSec?: number;
}): number {
  const start = Math.max(0, Math.floor(opts.startOffsetSec));
  const prefix = Math.max(0, Math.floor(opts.prefixCount));
  const seg = opts.segmentSec > 0 ? opts.segmentSec : 4;
  const diskEncoded = prefix * seg;
  const fromManifest = Math.max(0, opts.manifestEncodedSec ?? 0);
  // Prefer disk floor when the playlist is empty, truncated, or only lists a
  // restarted tail (MEDIA-SEQUENCE jumped while segs 0..N-1 still exist).
  const encoded = fromManifest + 1 >= diskEncoded ? fromManifest : diskEncoded;
  return start + encoded;
}

/** True when the m3u8 is missing, empty, or has no #EXTINF media entries. */
export function manifestNeedsContiguityHeal(manifestText: string): boolean {
  const text = manifestText.trim();
  if (!text || !text.includes("#EXTM3U")) return true;
  return !/#EXTINF:/i.test(text);
}

/**
 * ffmpeg resume without append_list can rewrite MEDIA-SEQUENCE to the tip while
 * seg_00000… still exist on disk. Contiguous tip-only playlists look "valid" to
 * gap checks but hide the full encode — clients then get EVENT+900 windows and
 * mid-film seeks snap to a few minutes.
 */
export function manifestIsTipOnlyTail(
  manifestText: string,
  onDisk: ReadonlySet<string>
): boolean {
  if (!onDisk.has("seg_00000.ts")) return false;
  let firstSeq: number | null = null;
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
    firstSeq = seq;
    break;
  }
  return firstSeq != null && firstSeq > 0;
}

/** Encoded coverage from playlist text and/or contiguous disk prefix. */
export function encodedCoverageSec(opts: {
  manifestText?: string | null;
  onDisk?: ReadonlySet<string> | null;
  segmentSec: number;
}): number {
  const seg = opts.segmentSec > 0 ? opts.segmentSec : 4;
  const fromManifest = opts.manifestText
    ? sumExtinfDurationSec(opts.manifestText)
    : 0;
  const prefix = opts.onDisk ? contiguousSegmentCount(opts.onDisk) : 0;
  const diskFloor = prefix * seg;
  return Math.max(fromManifest, diskFloor);
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
  defaultSegSec: number,
  opts?: { playlistComplete?: boolean }
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
  if (opts?.playlistComplete) lines.push("#EXT-X-ENDLIST");
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
    // Never keep ENDLIST in the header bucket — source playlists (and
    // buildManifestFromContiguousDisk) put it after segments, so naively
    // pushing # tags into `header` moves ENDLIST *before* media. hls.js then
    // treats the VOD as empty (0 segments before ENDLIST) and scrub/resume die.
    if (/^#EXT-X-ENDLIST/i.test(trimmed)) continue;
    if (trimmed.startsWith("#")) header.push(line);
  }

  let kept = trimContiguousSegmentsFromStart(pairs);
  // Leading discontinuity before seg_00000 breaks hls.js resume seeks (playhead
  // never advances). Drop it — real mid-stream discontinuities stay.
  if (kept.length > 0) {
    kept[0] = { ...kept[0]!, discontinuity: false };
  }
  if (!playlistComplete && kept.length > MAX_IN_PROGRESS_PLAYLIST_SEGMENTS) {
    /** Keep from the start — VOD transcode always plays forward from seg_00000. */
    kept = kept.slice(0, MAX_IN_PROGRESS_PLAYLIST_SEGMENTS);
  }
  if (
    !playlistComplete &&
    kept.length >= IN_PROGRESS_ENCODE_EDGE_HOLDBACK + 2
  ) {
    kept = kept.slice(0, kept.length - IN_PROGRESS_ENCODE_EDGE_HOLDBACK);
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
