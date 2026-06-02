/**
 * Server-safe TV / living-room browser detection from User-Agent only.
 * Used by middleware (layout hints) and client `detectTvBrowser()`.
 */

/** Request header set by middleware — read in root layout to skip remote fonts on TVs. */
export const STREAM_TV_HEADER = "x-stream-tv";

/** Amazon Silk (Fire TV, Echo Show, Fire tablets) — weak MSE stack; skip heavy fonts + tune playback. */
export const STREAM_SILK_HEADER = "x-stream-silk";

/** Samsung Tizen / Smart TV browser — defaults to ~125% page zoom. */
export const STREAM_SAMSUNG_TV_HEADER = "x-stream-samsung-tv";

/** Any Amazon Silk browser (WebView stack differs from Chrome TV). */
export function isAmazonSilkUserAgent(ua: string): boolean {
  if (!ua) return false;
  return /\bsilk\b/i.test(ua);
}

export function isTvClassUserAgent(ua: string): boolean {
  if (!ua) return false;
  const u = ua.toLowerCase();

  if (/smart[-_\s]?tv/.test(u)) return true;
  if (/\btizen\b/.test(u)) return true;
  if (/\bwebos\b/.test(u)) return true;
  if (/\blg\s+netcast\b/.test(u)) return true;
  if (/\bhbbtv\b/.test(u)) return true;
  if (/\bbravia\b/.test(u)) return true;
  if (/\bopera tv\b/.test(u)) return true;
  if (/googletv/.test(u)) return true;
  if (/androidtv/.test(u)) return true;
  if (/;\s*tv[\s);]/.test(u)) return true;
  if (/aft[a-z]{2,5}\)/i.test(ua)) return true;
  if (/playstation|nintendo|xbox/i.test(ua)) return true;
  if (/crkey/i.test(u)) return true;

  /** Amazon Silk on Fire TV / Echo Show — avoid classifying tablet Silk without TV hints */
  if (
    /\bsilk\b/.test(u) &&
    /(aft[a-z]{2,5}|fire\s*tv|amazon\.fire|cloud_fire_tv)/i.test(ua)
  ) {
    return true;
  }

  /** Samsung Internet on TV — exclude typical Galaxy phone UAs */
  if (
    /\bsamsungbrowser\b/.test(u) &&
    /(smart[-_\s]?tv|tizen|\btv\b|family\s*tv|living\s*room)/i.test(ua)
  ) {
    return true;
  }

  return false;
}

/** Samsung Smart TV (Tizen) — browser zoom is typically 125%. */
export function isSamsungTvUserAgent(ua: string): boolean {
  if (!ua) return false;
  const u = ua.toLowerCase();
  if (/\btizen\b/.test(u)) return true;
  if (/samsung/i.test(ua) && /smart[-_\s]?tv/i.test(ua)) return true;
  if (
    /\bsamsungbrowser\b/.test(u) &&
    /(smart[-_\s]?tv|tizen|\btv\b|family\s*tv)/i.test(ua)
  ) {
    return true;
  }
  return false;
}
