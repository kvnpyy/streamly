/**
 * Gate who may call `/api/stream` by inbound User-Agent (abuse reduction).
 * Real browsers and embedded WebViews send `Mozilla/...`; upstream fetch uses a
 * different spoofed UA — this only inspects the client request.
 */

import { isChromecastReceiverUserAgent } from "@/lib/chromecast-ua";

export function isAllowedStreamProxyUserAgent(
  userAgent: string,
  extraSubstrings: readonly string[]
): boolean {
  const ua = userAgent.trim();
  if (!ua) return false;
  if (isChromecastReceiverUserAgent(ua)) return true;
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
