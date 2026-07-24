import "server-only";

import crypto from "crypto";
import fsp from "fs/promises";
import path from "path";

const IPTV_UA_VOD = "VLC/3.0.20 LibVLC/3.0.20";

export type VodSourceStatus = {
  key: string;
  upstream: string;
  path: string;
  bytes: number;
  totalBytes: number | null;
  complete: boolean;
  error?: string;
  /** 0–100 when total known; otherwise estimate from start threshold. */
  pct: number;
};

type SourceEntry = {
  key: string;
  upstream: string;
  partialPath: string;
  finalPath: string;
  bytes: number;
  totalBytes: number | null;
  /** True when totalBytes came from Content-Length / Content-Range. */
  sizeAuthoritative: boolean;
  complete: boolean;
  error?: string;
  lastTouchAt: number;
  downloadPromise: Promise<void> | null;
  abort: AbortController | null;
};

const entries = new Map<string, SourceEntry>();
let idleSweepTimer: ReturnType<typeof setInterval> | null = null;

function upstreamReferer(upstreamUrl: string): string {
  try {
    const u = new URL(upstreamUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

export function isVodSourceCacheEnabled(): boolean {
  if (process.env.STREAM_VOD_SOURCE_CACHE === "0") return false;
  if (process.env.STREAM_VOD_SOURCE_CACHE === "1") return true;
  return process.env.STREAM_VOD_TRANSCODE === "1";
}

export function vodSourceStartBytes(): number {
  const n = parseInt(process.env.STREAM_VOD_SOURCE_START_BYTES ?? "12000000", 10);
  return Number.isFinite(n) && n >= 1_000_000 && n <= 200_000_000 ? n : 12_000_000;
}

/**
 * How many local bytes we need before ffmpeg `-ss` is safe on a partial file.
 * Uses known total/duration bitrate when available; otherwise ~2.5 Mbps.
 */
export function estimateBytesForSeekSec(
  seekSec: number,
  opts?: { totalBytes?: number | null; durationSec?: number | null }
): number {
  const floor = vodSourceStartBytes();
  const s = Math.max(0, seekSec);
  if (s <= 0) return floor;
  const padSec = 60;
  const targetSec = s + padSec;
  const total = opts?.totalBytes;
  const dur = opts?.durationSec;
  if (
    typeof total === "number" &&
    total > 0 &&
    typeof dur === "number" &&
    dur > 30
  ) {
    return Math.max(floor, Math.ceil((total / dur) * targetSec));
  }
  return Math.max(floor, Math.ceil(targetSec * 320_000));
}

function sourceRoot(): string {
  return (
    process.env.STREAM_VOD_SOURCE_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "vod-source")
  );
}

function sourceIdleMs(): number {
  // Long enough for pause / snack breaks without deleting the cached episode.
  const n = parseInt(process.env.STREAM_VOD_SOURCE_IDLE_MS ?? "10800000", 10);
  return Number.isFinite(n) && n >= 60_000 && n <= 86_400_000 ? n : 10_800_000;
}

function sourceIdleSweepMs(): number {
  const n = parseInt(process.env.STREAM_VOD_SOURCE_IDLE_SWEEP_MS ?? "60000", 10);
  return Number.isFinite(n) && n >= 15_000 && n <= 600_000 ? n : 60_000;
}

function sourceMaxCacheBytes(): number {
  const n = parseInt(process.env.STREAM_VOD_SOURCE_MAX_BYTES ?? "40000000000", 10);
  return Number.isFinite(n) && n >= 2_000_000_000 ? n : 40_000_000_000;
}

export function vodSourceCacheKey(upstream: string): string {
  return crypto.createHash("sha256").update(upstream).digest("hex").slice(0, 32);
}

function statusFromEntry(entry: SourceEntry): VodSourceStatus {
  const filePath = entry.complete ? entry.finalPath : entry.partialPath;
  let pct = 0;
  if (entry.complete) {
    pct = 100;
  } else if (entry.totalBytes && entry.totalBytes > 0) {
    pct = Math.min(99, Math.round((entry.bytes / entry.totalBytes) * 100));
  } else {
    const start = vodSourceStartBytes();
    pct = Math.min(85, Math.round((entry.bytes / start) * 70));
  }
  return {
    key: entry.key,
    upstream: entry.upstream,
    path: filePath,
    bytes: entry.bytes,
    totalBytes: entry.totalBytes,
    complete: entry.complete,
    error: entry.error,
    pct,
  };
}

async function syncEntryBytes(entry: SourceEntry): Promise<void> {
  if (entry.complete) {
    try {
      const st = await fsp.stat(entry.finalPath);
      entry.bytes = st.size;
      entry.totalBytes = st.size;
    } catch {
      entry.complete = false;
    }
    return;
  }
  try {
    const st = await fsp.stat(entry.partialPath);
    entry.bytes = st.size;
  } catch {
    entry.bytes = 0;
  }
}

async function ensureEntry(upstream: string): Promise<SourceEntry> {
  const key = vodSourceCacheKey(upstream);
  let entry = entries.get(key);
  if (entry) {
    entry.lastTouchAt = Date.now();
    await syncEntryBytes(entry);
    return entry;
  }

  const root = sourceRoot();
  await fsp.mkdir(root, { recursive: true });
  const partialPath = path.join(root, `${key}.partial`);
  const finalPath = path.join(root, `${key}.bin`);

  entry = {
    key,
    upstream,
    partialPath,
    finalPath,
    bytes: 0,
    totalBytes: null,
    sizeAuthoritative: false,
    complete: false,
    lastTouchAt: Date.now(),
    downloadPromise: null,
    abort: null,
  };

  try {
    const st = await fsp.stat(finalPath);
    if (st.size > 0) {
      entry.complete = true;
      entry.bytes = st.size;
      entry.totalBytes = st.size;
      // On-disk .bin from a prior run — treat as authoritative until proven short.
      entry.sizeAuthoritative = true;
    }
  } catch {
    try {
      const st = await fsp.stat(partialPath);
      entry.bytes = st.size;
    } catch {
      /* fresh */
    }
  }

  entries.set(key, entry);
  ensureIdleSweepRunning();
  return entry;
}

function parseTotalFromContentRange(header: string | null): number | null {
  if (!header) return null;
  const m = /\/(\d+)\s*$/.exec(header);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function runDownload(entry: SourceEntry): Promise<void> {
  const referer = upstreamReferer(entry.upstream);
  await syncEntryBytes(entry);
  if (entry.complete) return;

  const existing = entry.bytes;
  const headers: Record<string, string> = {
    "user-agent": IPTV_UA_VOD,
  };
  if (referer) headers.Referer = referer;
  if (existing > 0) {
    headers.Range = `bytes=${existing}-`;
  }

  const ac = new AbortController();
  entry.abort = ac;

  let res: Response;
  try {
    res = await fetch(entry.upstream, {
      headers,
      redirect: "follow",
      cache: "no-store",
      signal: ac.signal,
    });
  } catch (err) {
    if (ac.signal.aborted) return;
    entry.error =
      err instanceof Error ? err.message : "Source download failed.";
    throw err;
  }

  if (res.status === 416 && existing > 0) {
    // Already have the full object according to the server.
    try {
      await fsp.rename(entry.partialPath, entry.finalPath);
      entry.complete = true;
      entry.sizeAuthoritative = true;
      await syncEntryBytes(entry);
      entry.error = undefined;
      return;
    } catch {
      /* fall through */
    }
  }

  if (!res.ok && res.status !== 206) {
    entry.error = `Provider returned HTTP ${res.status} while downloading.`;
    throw new Error(entry.error);
  }

  const totalFromRange = parseTotalFromContentRange(
    res.headers.get("content-range")
  );
  const contentLength = parseInt(res.headers.get("content-length") ?? "", 10);
  if (totalFromRange) {
    entry.totalBytes = totalFromRange;
    entry.sizeAuthoritative = true;
  } else if (
    res.status === 200 &&
    Number.isFinite(contentLength) &&
    contentLength > 0
  ) {
    entry.totalBytes = contentLength;
    entry.sizeAuthoritative = true;
  }

  const append = res.status === 206 && existing > 0;
  if (!append && existing > 0) {
    // Server ignored Range — restart from scratch.
    await fsp.rm(entry.partialPath, { force: true }).catch(() => {});
    entry.bytes = 0;
  }

  if (!res.body) {
    entry.error = "Provider returned an empty download body.";
    throw new Error(entry.error);
  }

  let written = append ? existing : 0;
  const fh = await fsp.open(entry.partialPath, append ? "a" : "w");
  try {
    const reader = res.body.getReader();
    while (true) {
      if (ac.signal.aborted) {
        try {
          await reader.cancel();
        } catch {
          /* noop */
        }
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      await fh.write(value);
      written += value.byteLength;
      entry.bytes = written;
      entry.lastTouchAt = Date.now();
    }
  } catch (err) {
    if (ac.signal.aborted) return;
    entry.error =
      err instanceof Error ? err.message : "Source download interrupted.";
    throw err;
  } finally {
    await fh.close().catch(() => {});
    entry.abort = null;
  }

  await syncEntryBytes(entry);
  if (
    entry.totalBytes != null &&
    entry.bytes >= entry.totalBytes &&
    entry.bytes > 0
  ) {
    await fsp.rename(entry.partialPath, entry.finalPath);
    entry.complete = true;
    entry.error = undefined;
    await syncEntryBytes(entry);
    return;
  }

  if (entry.totalBytes != null && entry.bytes < entry.totalBytes) {
    // Truncated / connection drop — keep .partial so Range resume can continue.
    entry.error = undefined;
    return;
  }

  // No Content-Length / Content-Range: treat clean EOF as complete (common on some CDNs).
  if (entry.totalBytes == null && entry.bytes > 0) {
    await fsp.rename(entry.partialPath, entry.finalPath);
    entry.complete = true;
    entry.totalBytes = entry.bytes;
    entry.sizeAuthoritative = false;
    entry.error = undefined;
  }
}

/** Start (or resume) downloading the upstream file. Safe to call repeatedly. */
export function ensureVodSource(upstream: string): void {
  if (!isVodSourceCacheEnabled()) return;
  void ensureVodSourceStarted(upstream);
}

async function ensureVodSourceStarted(upstream: string): Promise<SourceEntry> {
  const entry = await ensureEntry(upstream);
  if (entry.complete) return entry;
  if (!entry.downloadPromise) {
    entry.downloadPromise = runDownload(entry)
      .catch(() => {
        /* error stored on entry */
      })
      .finally(() => {
        entry.downloadPromise = null;
      });
  }
  return entry;
}

export function touchVodSource(upstream: string): void {
  if (!isVodSourceCacheEnabled()) return;
  const key = vodSourceCacheKey(upstream);
  const entry = entries.get(key);
  if (entry) entry.lastTouchAt = Date.now();
  else ensureVodSource(upstream);
}

export async function getVodSourceStatus(
  upstream: string
): Promise<VodSourceStatus | null> {
  if (!isVodSourceCacheEnabled()) return null;
  const entry = await ensureEntry(upstream);
  return statusFromEntry(entry);
}

/**
 * Block until the local source has at least `minBytes` (or is complete / errored).
 */
export async function waitForVodSourceBytes(
  upstream: string,
  minBytes: number,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<VodSourceStatus> {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) {
      throw new Error("Source download aborted.");
    }
    const entry = await ensureVodSourceStarted(upstream);
    entry.lastTouchAt = Date.now();
    if (entry.error && entry.bytes < minBytes && !entry.downloadPromise) {
      await ensureVodSourceStarted(upstream);
    }
    if (entry.complete || entry.bytes >= minBytes) {
      return statusFromEntry(entry);
    }
    if (entry.error && !entry.downloadPromise && entry.bytes === 0) {
      throw new Error(entry.error);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  const entry = await ensureEntry(upstream);
  if (entry.complete || entry.bytes >= minBytes) {
    return statusFromEntry(entry);
  }
  throw new Error(
    entry.error ||
      "Timed out waiting for enough of this episode to download for playback."
  );
}

/** Wait until enough of the file is local for an ffmpeg `-ss` seek to succeed. */
export async function waitForVodSourceForSeek(
  upstream: string,
  seekSec: number,
  opts?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    durationSec?: number | null;
  }
): Promise<VodSourceStatus> {
  const st0 = await getVodSourceStatus(upstream);
  const need = estimateBytesForSeekSec(seekSec, {
    totalBytes: st0?.totalBytes,
    durationSec: opts?.durationSec,
  });
  const timeoutMs =
    opts?.timeoutMs ??
    Math.min(600_000, Math.max(180_000, Math.floor(seekSec) * 2_500 + 120_000));
  return waitForVodSourceBytes(upstream, need, {
    signal: opts?.signal,
    timeoutMs,
  });
}

/**
 * Abort an in-flight download but keep the partial/final file on disk.
 * Used when the player closes so single-connection panels free the slot.
 */
export function releaseVodSourceDownload(upstream: string): void {
  if (!isVodSourceCacheEnabled()) return;
  const key = vodSourceCacheKey(upstream);
  const entry = entries.get(key);
  if (!entry) return;
  entry.lastTouchAt = Date.now();
  if (entry.abort) {
    try {
      entry.abort.abort();
    } catch {
      /* noop */
    }
    entry.abort = null;
  }
}

/**
 * If a prior download was marked complete but the encode proves the file was
 * truncated (no authoritative Content-Length), reopen as partial so we can retry.
 */
export async function reopenVodSourceIfTruncated(
  upstream: string,
  encodedSec: number,
  durationSec: number | null
): Promise<boolean> {
  if (!isVodSourceCacheEnabled()) return false;
  if (durationSec == null || durationSec < 60) return false;
  if (encodedSec >= durationSec * 0.85) return false;

  const entry = await ensureEntry(upstream);
  if (!entry.complete) {
    ensureVodSource(upstream);
    return true;
  }
  if (entry.sizeAuthoritative) return false;

  try {
    if (
      await fsp
        .stat(entry.finalPath)
        .then(() => true)
        .catch(() => false)
    ) {
      await fsp.rename(entry.finalPath, entry.partialPath);
    }
  } catch {
    /* noop */
  }
  entry.complete = false;
  entry.totalBytes = null;
  entry.sizeAuthoritative = false;
  entry.error = undefined;
  await syncEntryBytes(entry);
  // Full re-fetch — tentative EOF left a short file; Range from end won't help.
  await fsp.rm(entry.partialPath, { force: true }).catch(() => {});
  entry.bytes = 0;
  ensureVodSource(upstream);
  return true;
}

/** True when the on-disk source is fully downloaded. */
export async function isVodSourceComplete(upstream: string): Promise<boolean> {
  if (!isVodSourceCacheEnabled()) return true; // no gate when disabled
  const entry = await ensureEntry(upstream);
  return entry.complete;
}

/**
 * Wait until the source grows past `afterBytes` (for ffmpeg EOF on a partial file).
 */
export async function waitForVodSourceGrowth(
  upstream: string,
  afterBytes: number,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<VodSourceStatus> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) {
      throw new Error("Source download aborted.");
    }
    const entry = await ensureVodSourceStarted(upstream);
    entry.lastTouchAt = Date.now();
    if (entry.complete || entry.bytes > afterBytes) {
      return statusFromEntry(entry);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  const entry = await ensureEntry(upstream);
  return statusFromEntry(entry);
}

export async function wipeVodSource(upstream: string): Promise<void> {
  const key = vodSourceCacheKey(upstream);
  const entry = entries.get(key);
  if (entry?.abort) {
    try {
      entry.abort.abort();
    } catch {
      /* noop */
    }
  }
  entries.delete(key);
  const root = sourceRoot();
  await fsp.rm(path.join(root, `${key}.partial`), { force: true }).catch(() => {});
  await fsp.rm(path.join(root, `${key}.bin`), { force: true }).catch(() => {});
}

function ensureIdleSweepRunning(): void {
  if (idleSweepTimer) return;
  idleSweepTimer = setInterval(() => {
    void sweepIdleVodSources();
  }, sourceIdleSweepMs());
  idleSweepTimer.unref?.();
}

async function directorySizeBytes(dir: string): Promise<number> {
  try {
    const names = await fsp.readdir(dir);
    let total = 0;
    for (const name of names) {
      try {
        const st = await fsp.stat(path.join(dir, name));
        if (st.isFile()) total += st.size;
      } catch {
        /* skip */
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function sweepIdleVodSources(): Promise<void> {
  const now = Date.now();
  const idleMs = sourceIdleMs();
  for (const [key, entry] of [...entries.entries()]) {
    if (entry.downloadPromise) continue;
    if (now - entry.lastTouchAt < idleMs) continue;
    if (entry.abort) {
      try {
        entry.abort.abort();
      } catch {
        /* noop */
      }
    }
    entries.delete(key);
    await fsp.rm(entry.partialPath, { force: true }).catch(() => {});
    await fsp.rm(entry.finalPath, { force: true }).catch(() => {});
  }

  const root = sourceRoot();
  const maxBytes = sourceMaxCacheBytes();
  let used = await directorySizeBytes(root);
  if (used <= maxBytes) return;

  // Evict oldest complete files first (by mtime).
  try {
    const names = await fsp.readdir(root);
    const files: Array<{ path: string; mtime: number; size: number }> = [];
    for (const name of names) {
      if (!name.endsWith(".bin") && !name.endsWith(".partial")) continue;
      const p = path.join(root, name);
      try {
        const st = await fsp.stat(p);
        files.push({ path: p, mtime: st.mtimeMs, size: st.size });
      } catch {
        /* skip */
      }
    }
    files.sort((a, b) => a.mtime - b.mtime);
    for (const f of files) {
      if (used <= maxBytes) break;
      const base = path.basename(f.path);
      const key = base.replace(/\.(bin|partial)$/, "");
      const live = entries.get(key);
      if (live?.downloadPromise) continue;
      if (live && Date.now() - live.lastTouchAt < idleMs) continue;
      await fsp.rm(f.path, { force: true }).catch(() => {});
      entries.delete(key);
      used -= f.size;
    }
  } catch {
    /* noop */
  }
}

/** Test helper — clear in-memory state. */
export function _resetVodSourceCacheForTests(): void {
  for (const entry of entries.values()) {
    try {
      entry.abort?.abort();
    } catch {
      /* noop */
    }
  }
  entries.clear();
  if (idleSweepTimer) {
    clearInterval(idleSweepTimer);
    idleSweepTimer = null;
  }
}
