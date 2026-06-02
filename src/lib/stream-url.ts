/**
 * Query flags on `/api/stream` that tune manifest rewriting for the client.
 */

/** Master playlists: strip HEVC / Dolby rungs when a safer variant exists (see hls-manifest-tv-sanitize). */
export function appendStreamCompatMse(proxyUrl: string): string {
  if (!proxyUrl.includes("/api/stream")) return proxyUrl;
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://localhost";
    const u = new URL(proxyUrl, base);
    if (u.searchParams.get("compat") === "mse") {
      return u.pathname + u.search;
    }
    u.searchParams.set("compat", "mse");
    return u.pathname + u.search;
  } catch {
    return proxyUrl;
  }
}

export function streamProxyTypeIsHls(proxyUrl: string): boolean {
  if (!proxyUrl.includes("/api/stream")) return false;
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://localhost";
    const u = new URL(proxyUrl, base);
    return u.searchParams.get("type") === "hls";
  } catch {
    return /\.m3u8/i.test(proxyUrl);
  }
}

/** Live HLS through our proxy — ask the server for browser-friendly variant filtering. */
export function withLiveHlsCompatMse(proxyUrl: string, isLive: boolean): string {
  if (!isLive || !streamProxyTypeIsHls(proxyUrl)) return proxyUrl;
  return appendStreamCompatMse(proxyUrl);
}
