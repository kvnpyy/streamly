import crypto from "crypto";
import path from "path";

/**
 * Cache paths and keys for VOD transcodes, with no state of their own.
 * Routes that only need a path import this instead of vod-transcode: each
 * importing route otherwise gets its own copy of that module, with its own
 * job list and disk sweeper that deletes the other copy's live downloads.
 */

const CACHE_KEY_SUFFIX = "|v9-hscale";

export function transcodeCacheRoot(): string {
  return (
    process.env.STREAM_TRANSCODE_CACHE_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "vod-transcode")
  );
}

export function cacheKeyForUpstream(
  upstream: string,
  startOffsetSec = 0,
  pack?: "ts"
): string {
  const off = Math.max(0, Math.floor(startOffsetSec));
  const packTag = pack === "ts" ? "|ts" : "";
  return crypto
    .createHash("sha256")
    .update(upstream + CACHE_KEY_SUFFIX + `|o${off}` + packTag)
    .digest("hex")
    .slice(0, 32);
}

/** On-disk directory for a from-0 (or offset) transcode of this upstream. */
export function vodTranscodeJobDir(
  upstream: string,
  startOffsetSec = 0
): string {
  return path.join(transcodeCacheRoot(), cacheKeyForUpstream(upstream, startOffsetSec));
}

function upstreamLooksLikeVod(upstreamUrl: URL): boolean {
  const p = upstreamUrl.pathname.toLowerCase();
  if (p.includes("/live/")) return false;
  return (
    p.includes("/movie/") ||
    p.includes("/series/") ||
    /\.(mkv|avi|mp4|mov|wmv|flv|ts|m2ts|mpeg|mpg|webm)($|\?)/i.test(p)
  );
}

export function upstreamEligibleForVodTranscode(upstream: string): boolean {
  try {
    const u = new URL(upstream);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return upstreamLooksLikeVod(u);
  } catch {
    return false;
  }
}
