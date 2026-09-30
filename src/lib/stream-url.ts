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

/** Upstream provider URL embedded in `/api/stream?u=…`. */
export function extractStreamProxyUpstream(
  proxyUrl: string | null | undefined
): string | null {
  if (!proxyUrl) return null;
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://localhost";
    const parsed = new URL(proxyUrl, base);
    if (
      parsed.pathname !== "/api/stream" &&
      !parsed.pathname.startsWith("/api/stream/")
    ) {
      return null;
    }
    const upstream = parsed.searchParams.get("u")?.trim();
    if (!upstream || !/^https?:\/\//i.test(upstream)) return null;
    return upstream;
  } catch {
    return null;
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

export function playbackUrlUsesLiveRemux(proxyUrl: string): boolean {
  if (!proxyUrl.includes("/api/stream")) return false;
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://localhost";
    return new URL(proxyUrl, base).searchParams.get("remux") === "copy";
  } catch {
    return /(?:^|[?&])remux=copy(?:&|$)/.test(proxyUrl);
  }
}

/** Server is re-encoding this live channel to H.264 + AAC for the phone. */
export function playbackUrlUsesLiveBrowserTranscode(proxyUrl: string): boolean {
  if (!proxyUrl.includes("/api/stream")) return false;
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://localhost";
    return new URL(proxyUrl, base).searchParams.get("remux") === "browser";
  } catch {
    return /(?:^|[?&])remux=browser(?:&|$)/.test(proxyUrl);
  }
}

/**
 * Same proxy URL, served from a server-side copy-remux window after the
 * channel has already failed gentle recovery twice.
 */
export function withLiveCopyRemux(proxyUrl: string): string | null {
  if (!proxyUrl.includes("/api/stream")) return null;
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://localhost";
    const u = new URL(proxyUrl, base);
    if (!u.searchParams.get("u")) return null;
    u.searchParams.set("type", "hls");
    u.searchParams.set("remux", "copy");
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

/**
 * Same proxy URL, served from a server-side H.264 + AAC window after the
 * phone or Safari rejects the provider codecs.
 */
export function withLiveBrowserTranscode(proxyUrl: string): string | null {
  if (!proxyUrl.includes("/api/stream")) return null;
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://localhost";
    const u = new URL(proxyUrl, base);
    if (!u.searchParams.get("u")) return null;
    u.searchParams.set("type", "hls");
    u.searchParams.set("remux", "browser");
    u.searchParams.delete("compat");
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

/** Live HLS through our proxy — ask the server for browser-friendly variant filtering. */
export function withLiveHlsCompatMse(proxyUrl: string, isLive: boolean): string {
  if (!isLive || !streamProxyTypeIsHls(proxyUrl)) return proxyUrl;
  return appendStreamCompatMse(proxyUrl);
}
