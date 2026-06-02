import { playbackUrlUsesVodTranscode } from "@/lib/vod-transcode-url";

/** Live is always treated as HLS. VOD may be HLS if the URL or proxied `u=` upstream ends with .m3u8. */
export function playbackUrlIsHls(url: string, kindIsLive: boolean): boolean {
  if (kindIsLive) return true;
  if (playbackUrlUsesVodTranscode(url)) return true;
  if (url.includes("type=hls")) return true;
  if (/\.m3u8($|[?#])/i.test(url)) return true;
  try {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
    const parsed = new URL(url, origin);
    const upstream = parsed.searchParams.get("u");
    if (!upstream) return false;
    const decoded = decodeURIComponent(upstream);
    return /\.m3u8($|[?#])/i.test(decoded) || decoded.includes(".m3u8");
  } catch {
    return false;
  }
}
