/**
 * Phone live playback via raw MPEG-TS (mpegts.js), matching the
 * webplayer.online `toWebTs` rewrite: Xtream `/live/user/pass/id` becomes
 * `id.ts?player=web` so the panel sends one continuous TS program instead of
 * an HLS playlist.
 */

import { extractStreamProxyUpstream } from "@/lib/stream-url";

export type LiveMpegtsFailureAction = "hls" | "transcode";

const MPEGTS_CODEC_DETAILS = new Set([
  "CodecUnsupported",
  "MediaMSEError",
]);

/**
 * MSE codec rejects (AC-3, HEVC, MPEG-2) cannot be fixed by playing the raw
 * TS. On iPhone, native HLS can still decode AC-3, so try that before the
 * server encoder. Android MSE and hls.js share the same codec wall, so go
 * straight to the encoder.
 */
export function liveMpegtsFailureAction(
  detail: string,
  appleMobile: boolean
): LiveMpegtsFailureAction {
  if (!MPEGTS_CODEC_DETAILS.has(detail)) return "hls";
  if (appleMobile) return "hls";
  return "transcode";
}

/** Phones only. Desktop and TV keep the existing HLS pipeline. */
export function isPhoneLiveClient(opts: {
  appleMobile: boolean;
  userAgent: string;
  narrowViewport: boolean;
  tv: boolean;
  silk: boolean;
}): boolean {
  if (opts.tv || opts.silk) return false;
  if (opts.appleMobile) return true;
  const ua = opts.userAgent || "";
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  if (opts.narrowViewport && /Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return false;
}

/**
 * Xtream live upstream → continuous MPEG-TS with the panel's web-player flag.
 * Returns null for VOD files and non-Xtream URLs.
 */
export function xtreamLiveUpstreamToWebTs(upstream: string): string | null {
  let url: URL;
  try {
    url = new URL(upstream);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/");
  if (parts.length < 5 || parts[1] !== "live") return null;
  const last = parts[parts.length - 1] ?? "";
  if (!last || last === "." || last === "..") return null;
  if (/\.(mp4|mkv|avi|webm|mov)$/i.test(last)) return null;

  let id = last;
  if (/\.m3u8$/i.test(last)) id = last.replace(/\.m3u8$/i, "");
  else if (/\.ts$/i.test(last)) id = last.replace(/\.ts$/i, "");
  else if (last.includes(".")) return null;
  if (!id) return null;

  parts[parts.length - 1] = `${id}.ts`;
  url.pathname = parts.join("/");
  url.searchParams.set("player", "web");
  return url.toString();
}

/** Same `/api/stream` URL, but the upstream is the raw `.ts?player=web` feed. */
export function withLiveMpegtsProxy(proxyUrl: string): string | null {
  const upstream = extractStreamProxyUpstream(proxyUrl);
  if (!upstream) return null;
  const webTs = xtreamLiveUpstreamToWebTs(upstream);
  if (!webTs) return null;
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://localhost";
    const u = new URL(proxyUrl, base);
    u.searchParams.set("u", webTs);
    u.searchParams.set("type", "mpegts");
    u.searchParams.delete("remux");
    u.searchParams.delete("compat");
    u.searchParams.delete("media");
    u.searchParams.delete("transcode");
    u.searchParams.delete("cast");
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

export function playbackUrlUsesLiveMpegts(proxyUrl: string): boolean {
  if (!proxyUrl.includes("/api/stream")) return false;
  try {
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://localhost";
    return new URL(proxyUrl, base).searchParams.get("type") === "mpegts";
  } catch {
    return /(?:^|[?&])type=mpegts(?:&|$)/.test(proxyUrl);
  }
}
