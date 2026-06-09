/** Seconds between cached seek-preview frames (client + server). */
export const VOD_SEEK_PREVIEW_BUCKET_SEC = 8;

export function upstreamFromPlaybackProxyUrl(proxyUrl: string): string | null {
  if (!proxyUrl.startsWith("/api/stream")) return null;
  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    return new URL(proxyUrl, origin).searchParams.get("u");
  } catch {
    return null;
  }
}

export function bucketSeekPreviewSec(sec: number): number {
  const s = Math.max(0, Math.floor(sec));
  const bucket = VOD_SEEK_PREVIEW_BUCKET_SEC;
  return Math.floor(s / bucket) * bucket;
}

export function buildVodSeekPreviewUrl(upstream: string, sec: number): string {
  const t = bucketSeekPreviewSec(sec);
  return `/api/vod/thumbnail?u=${encodeURIComponent(upstream)}&t=${t}`;
}
