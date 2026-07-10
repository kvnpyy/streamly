/**
 * User-agents used when a Chromecast / Google TV receiver fetches media URLs.
 * These are not browser `Mozilla/…` strings — `/api/stream` must allow them.
 */
const CAST_RECEIVER_MARKERS = [
  "CrKey",
  "GoogleCast",
  "CastPlayer",
  "Chromecast",
  /** Nest Hub / some Google TV builds */
  "Nest Hub",
  "Google TV",
] as const;

export function isChromecastReceiverUserAgent(userAgent: string): boolean {
  const ua = userAgent.trim();
  if (!ua) return false;
  return CAST_RECEIVER_MARKERS.some((m) => ua.includes(m));
}
