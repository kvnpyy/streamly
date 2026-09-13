/** LRU plan for on-disk HLS transcode dirs. Idle stop keeps cache; this caps it. */

export type TranscodeDiskDir = {
  key: string;
  bytes: number;
  mtimeMs: number;
};

const DEFAULT_MAX_BYTES = 20_000_000_000;
const MIN_MAX_BYTES = 2_000_000_000;

export function transcodeMaxCacheBytes(
  raw = process.env.STREAM_TRANSCODE_MAX_BYTES
): number {
  const n = parseInt(raw ?? String(DEFAULT_MAX_BYTES), 10);
  return Number.isFinite(n) && n >= MIN_MAX_BYTES ? n : DEFAULT_MAX_BYTES;
}

/** Oldest unprotected dirs first, until `usedBytes` would fall to `maxBytes`. */
export function planTranscodeDiskEvictions(opts: {
  dirs: readonly TranscodeDiskDir[];
  usedBytes: number;
  maxBytes: number;
  protectKeys: Iterable<string>;
}): string[] {
  if (opts.usedBytes <= opts.maxBytes) return [];
  const protect = new Set(opts.protectKeys);
  const victims = opts.dirs
    .filter((d) => !protect.has(d.key) && d.bytes > 0)
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.key.localeCompare(b.key));
  const out: string[] = [];
  let used = opts.usedBytes;
  for (const d of victims) {
    if (used <= opts.maxBytes) break;
    out.push(d.key);
    used -= d.bytes;
  }
  return out;
}
