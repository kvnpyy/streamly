import {
  normalizeContainerExt,
  vodContainerUiHint,
} from "@/lib/utils";

/** Client-visible gate — must match server `STREAM_VOD_TRANSCODE=1` and ffmpeg on the host. */
export function isVodTranscodeEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_VOD_TRANSCODE === "1";
}

export function playbackUrlUsesVodTranscode(url: string): boolean {
  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, origin);
    return parsed.searchParams.get("transcode") === "hls";
  } catch {
    return url.includes("transcode=hls");
  }
}

/** Only same-origin proxied VOD URLs can be boosted. */
export function canVodTranscodeProxyUrl(proxyUrl: string): boolean {
  if (!proxyUrl.startsWith("/api/stream")) return false;
  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(proxyUrl, origin);
    if (parsed.searchParams.get("transcode") === "hls") return false;
    const type = parsed.searchParams.get("type") || "vod";
    if (type === "hls") return false;
    const upstream = parsed.searchParams.get("u");
    if (!upstream) return false;
    const up = new URL(upstream);
    const p = up.pathname.toLowerCase();
    if (p.includes("/live/")) return false;
    return (
      p.includes("/movie/") ||
      p.includes("/series/") ||
      /\.(mkv|avi|mp4|mov|wmv|flv|ts|m2ts|mpeg|mpg|webm)($|\?)/i.test(p)
    );
  } catch {
    return false;
  }
}

/** Remove transcode query params so we can rebuild a fresh playback URL. */
export function stripVodTranscodeParams(proxyUrl: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const parsed = new URL(proxyUrl, origin);
  parsed.searchParams.delete("transcode");
  parsed.searchParams.delete("compat");
  parsed.searchParams.delete("tc_reset");
  parsed.searchParams.delete("media");
  if (!parsed.searchParams.get("type")) parsed.searchParams.set("type", "vod");
  return `${parsed.pathname}?${parsed.searchParams.toString()}`;
}

/** Base `/api/stream?u=…&type=vod` URL whether or not transcode is already active. */
export function vodTranscodeBaseProxyUrl(proxyUrl: string): string | null {
  if (!proxyUrl.startsWith("/api/stream")) return null;
  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(proxyUrl, origin);
    if (!parsed.searchParams.get("u")) return null;
    const base = playbackUrlUsesVodTranscode(proxyUrl)
      ? stripVodTranscodeParams(proxyUrl)
      : proxyUrl;
    return canVodTranscodeProxyUrl(base) ? base : null;
  } catch {
    return null;
  }
}

/** Client "Try again" — always adds `tc_reset` so the server kills stale ffmpeg jobs. */
export function buildVodTranscodeRetryUrl(
  activeUrl: string,
  fallbackUrl: string,
  opts?: { compatMse?: boolean }
): string | null {
  const base =
    vodTranscodeBaseProxyUrl(activeUrl) ?? vodTranscodeBaseProxyUrl(fallbackUrl);
  if (!base) return null;
  return appendVodTranscodeHls(base, { ...opts, resetCache: true });
}

export function appendVodTranscodeHls(
  proxyUrl: string,
  opts?: {
    compatMse?: boolean;
    resetCache?: boolean;
    seekSec?: number;
  }
): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const parsed = new URL(proxyUrl, origin);
  parsed.searchParams.set("type", "vod");
  parsed.searchParams.set("transcode", "hls");
  if (opts?.compatMse) parsed.searchParams.set("compat", "mse");
  else parsed.searchParams.delete("compat");
  if (opts?.resetCache) parsed.searchParams.set("tc_reset", String(Date.now()));
  else parsed.searchParams.delete("tc_reset");
  const seek = opts?.seekSec;
  if (seek != null && seek > 0) {
    parsed.searchParams.set("tc_seek", String(Math.floor(seek)));
  } else {
    parsed.searchParams.delete("tc_seek");
  }
  return `${parsed.pathname}?${parsed.searchParams.toString()}`;
}

/** Seek within a long MKV — restart server encode near this timestamp (seconds). */
export function buildVodTranscodeSeekUrl(
  activeUrl: string,
  fallbackUrl: string,
  seekSec: number,
  opts?: { compatMse?: boolean }
): string | null {
  const base =
    vodTranscodeBaseProxyUrl(activeUrl) ?? vodTranscodeBaseProxyUrl(fallbackUrl);
  if (!base) return null;
  return appendVodTranscodeHls(base, {
    ...opts,
    seekSec: Math.max(0, Math.floor(seekSec)),
  });
}

/** Risky Xtream containers (MKV, TS, …) — prime candidates for server HLS boost. */
export function shouldPreferVodTranscodeOnTv(
  containerExt: string | undefined
): boolean {
  return vodContainerNeedsServerPrep(containerExt);
}

/** MKV/AVI/etc. — show prep UI and prefer server transcode when enabled. */
export function vodContainerNeedsServerPrep(
  containerExt: string | undefined
): boolean {
  return vodContainerUiHint(containerExt) === "risky";
}

/** Extension from proxied upstream `u=` (panels often mislabel MKV as MP4). */
export function upstreamMediaExtFromProxyUrl(proxyUrl: string): string | null {
  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(proxyUrl, origin);
    const upstream = parsed.searchParams.get("u");
    if (!upstream) return null;
    const path = decodeURIComponent(upstream).split(/[?#]/)[0].toLowerCase();
    const m = path.match(/\.([a-z0-9]{2,5})$/);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

/** Prefer the real file suffix in `u=` over unreliable panel metadata. */
export function inferVodContainerExtFromProxyUrl(
  proxyUrl: string,
  declaredExt?: string | null
): string {
  const fromUrl = upstreamMediaExtFromProxyUrl(proxyUrl);
  if (fromUrl) return fromUrl;
  const declared = normalizeContainerExt(declaredExt);
  return declared === "unknown" ? "mkv" : declared;
}

export function vodNeedsServerTranscodePrep(
  containerExt: string | undefined,
  proxyUrl: string
): boolean {
  return vodContainerNeedsServerPrep(
    inferVodContainerExtFromProxyUrl(proxyUrl, containerExt)
  );
}

/**
 * Pick the URL the player should load — never probe/play raw MKV when server
 * transcode is enabled (avoids HTTP/2 progressive failures in the browser).
 */
export function resolveVodPlaybackUrl(
  vodPlaybackUrl: string | null,
  proxyUrl: string,
  opts: {
    containerExt?: string;
    compatMse?: boolean;
    kindIsLive: boolean;
  }
): string {
  if (opts.kindIsLive) return vodPlaybackUrl ?? proxyUrl;
  const base = vodPlaybackUrl ?? proxyUrl;
  if (!isVodTranscodeEnabledClient()) return base;
  if (!canVodTranscodeProxyUrl(proxyUrl)) return base;
  if (!vodNeedsServerTranscodePrep(opts.containerExt, proxyUrl)) return base;
  if (playbackUrlUsesVodTranscode(base)) return base;
  return appendVodTranscodeHls(proxyUrl, { compatMse: opts.compatMse });
}

const warmInFlight = new Set<string>();
const warmLastAt = new Map<string, number>();

/** Start server transcode before Play (focus / hover) so first segment is ready sooner. */
export function warmVodTranscodePlay(
  proxyUrl: string,
  opts?: { compatMse?: boolean }
): void {
  if (!isVodTranscodeEnabledClient()) return;
  if (!canVodTranscodeProxyUrl(proxyUrl)) return;
  const url = appendVodTranscodeHls(proxyUrl, opts);
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (warmInFlight.has(url)) return;
  if (now - (warmLastAt.get(url) ?? 0) < 45_000) return;

  warmInFlight.add(url);
  void fetch(url, { method: "HEAD", credentials: "same-origin" })
    .catch(() => {})
    .finally(() => {
      warmInFlight.delete(url);
      warmLastAt.set(url, Date.now());
    });
}
