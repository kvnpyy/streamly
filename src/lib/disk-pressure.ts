import fsp from "fs/promises";
import {
  planTranscodeDiskEvictions,
  type TranscodeDiskDir,
} from "@/lib/vod-transcode-disk-cache";

/** Leave this much free on the volume so logs, SQLite, and the sampler can still write. */
export const DEFAULT_DISK_FREE_RESERVE_BYTES = 8_000_000_000;
const MIN_RESERVE_BYTES = 1_000_000_000;

export function diskFreeReserveBytes(
  raw = process.env.STREAM_DISK_FREE_RESERVE_BYTES
): number {
  const n = parseInt(raw ?? String(DEFAULT_DISK_FREE_RESERVE_BYTES), 10);
  return Number.isFinite(n) && n >= MIN_RESERVE_BYTES
    ? n
    : DEFAULT_DISK_FREE_RESERVE_BYTES;
}

/**
 * Bytes to delete so the cache is back under its cap and the volume has
 * `reserveBytes` free. A missing free-space reading only enforces the cap.
 */
export function bytesToReclaim(opts: {
  usedBytes: number;
  maxBytes: number;
  freeBytes: number | null;
  reserveBytes: number;
}): number {
  const overCap = Math.max(0, opts.usedBytes - opts.maxBytes);
  if (opts.freeBytes == null) return overCap;
  const shortOfReserve = Math.max(0, opts.reserveBytes - opts.freeBytes);
  return Math.max(overCap, shortOfReserve);
}

export async function filesystemFreeBytes(dir: string): Promise<number | null> {
  try {
    const st = await fsp.statfs(dir);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return null;
  }
}

/** Oldest unprotected files first, ignoring recency once the cap or reserve is breached. */
export function evictionKeysForPressure(opts: {
  files: readonly TranscodeDiskDir[];
  usedBytes: number;
  maxBytes: number;
  freeBytes: number | null;
  reserveBytes: number;
  protectKeys: Iterable<string>;
}): string[] {
  const reclaim = bytesToReclaim(opts);
  if (reclaim <= 0) return [];
  return planTranscodeDiskEvictions({
    dirs: opts.files,
    usedBytes: opts.usedBytes,
    maxBytes: Math.max(0, opts.usedBytes - reclaim),
    protectKeys: opts.protectKeys,
  });
}

const reclaimers: Array<() => Promise<void>> = [];
let reclaiming = false;

export function registerDiskReclaimer(fn: () => Promise<void>): void {
  if (!reclaimers.includes(fn)) reclaimers.push(fn);
}

/** Run every registered cache sweep once. Re-entrant calls no-op. */
export async function reclaimDiskPressure(): Promise<void> {
  if (reclaiming) return;
  reclaiming = true;
  try {
    for (const fn of reclaimers) {
      try {
        await fn();
      } catch {
        /* one cache failing must not skip the other */
      }
    }
  } finally {
    reclaiming = false;
  }
}
