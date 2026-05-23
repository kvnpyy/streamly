/** Must stay stable — changing it resets every visitor's saved choice. */
export const COOKIE_CONSENT_STORAGE_KEY = "stream-cookie-consent-v1";

export function isCookieConsentBannerEnabled(): boolean {
  return (
    typeof process.env.NEXT_PUBLIC_SHOW_COOKIE_CONSENT === "string" &&
    process.env.NEXT_PUBLIC_SHOW_COOKIE_CONSENT.trim() === "1"
  );
}

export type CookieConsentChoice = "essential" | "all";

export function getStoredCookieConsent(): CookieConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (v === "essential" || v === "all") return v;
    return null;
  } catch {
    return null;
  }
}

/**
 * When the banner is off, analytics may load immediately.
 * When the banner is on, only "Accept all" enables non-essential scripts (e.g. GA).
 */
export function cookieConsentAllowsAnalytics(): boolean {
  if (!isCookieConsentBannerEnabled()) return true;
  return getStoredCookieConsent() === "all";
}

export const COOKIE_CONSENT_CHANGED_EVENT = "streamly-cookie-consent-changed";
