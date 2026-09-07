/**
 * Gate who may call `/api/stream` by inbound User-Agent (abuse reduction).
 * Real browsers and embedded WebViews send `Mozilla/...`; upstream fetch uses a
 * different spoofed UA — this only inspects the client request.
 */

import { isChromecastReceiverUserAgent } from "@/lib/chromecast-ua";

/**
 * Players the share menu tells people to paste into. Their UAs are not
 * `Mozilla/…`, so they used to get 403 on the TV-safe `/api/stream` URL.
 */
const MEDIA_PLAYER_UA_MARKERS = [
  "vlc",
  "libvlc",
  "infuse",
  "kodi",
  "xbmc",
  "mpv",
  "lavf",
  "ffmpeg",
  "exoplayer",
  "ijkplayer",
  "applecoremedia",
  "tivimate",
  "smarters",
  "gstreamer",
  "nplayer",
  "justplayer",
  "roku",
  "tizen",
  "webos",
  "web0s",
] as const;

export function isMediaPlayerStreamUserAgent(userAgent: string): boolean {
  const lower = userAgent.trim().toLowerCase();
  if (!lower) return false;
  return MEDIA_PLAYER_UA_MARKERS.some((m) => lower.includes(m));
}

export function isAllowedStreamProxyUserAgent(
  userAgent: string,
  extraSubstrings: readonly string[]
): boolean {
  const ua = userAgent.trim();
  if (!ua) return false;
  if (isChromecastReceiverUserAgent(ua)) return true;
  if (isMediaPlayerStreamUserAgent(ua)) return true;
  if (/^Mozilla\//i.test(ua)) return true;
  const lower = ua.toLowerCase();
  for (const sub of extraSubstrings) {
    const s = sub.trim();
    if (!s) continue;
    if (lower.includes(s.toLowerCase())) return true;
  }
  return false;
}

export function streamProxyUaAllowExtraFromEnv(): string[] {
  const raw = process.env.STREAM_PROXY_UA_ALLOW_EXTRA ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isStreamProxyUaCheckDisabled(): boolean {
  return process.env.STREAM_PROXY_UA_CHECK_DISABLED === "1";
}

/**
 * Safari / WebKit clients (macOS, iOS, iPadOS). Excludes Chromium shells (Chrome, Edge, CriOS).
 * Used server-side to strip risky HLS variants from master playlists when possible.
 */
export function isSafariFamilyStreamClient(userAgent: string): boolean {
  const ua = userAgent.trim();
  if (!ua) return false;
  if (/\bChrom(?:e|ium)\b|\bEdg\//i.test(ua)) return false;
  if (/\bCriOS\b|\bFxiOS\b/i.test(ua)) return false;
  return /\bSafari\//i.test(ua);
}
