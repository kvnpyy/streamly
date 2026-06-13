import { detectTvBrowser } from "@/lib/tv-browser";
import { isAmazonSilkUserAgent, isTvClassUserAgent } from "@/lib/tv-user-agent";

/** Large screen + remote-style pointer (typical browser on a TV). */
export function isCoarsePointerLargeScreen(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse) and (min-width: 1024px)").matches;
}

/**
 * iPad / Android tablet — not a native TV browser.
 * iPadOS 13+ may report as Macintosh with touch points.
 */
export function isLikelyTabletDevice(ua?: string): boolean {
  if (typeof navigator === "undefined" && !ua) return false;
  const u = ua ?? navigator.userAgent ?? "";
  if (/iPad/i.test(u)) return true;
  if (
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1 &&
    /Macintosh/i.test(u)
  ) {
    return true;
  }
  if (/Android/i.test(u) && !/Mobile/i.test(u)) return true;
  return false;
}

/** Samsung Tizen, Fire TV, consoles, etc. — not coarse-pointer heuristics. */
export function isNativeTvUa(ua?: string): boolean {
  if (typeof navigator === "undefined" && !ua) return false;
  const u = ua ?? navigator.userAgent ?? "";
  return isTvClassUserAgent(u);
}

/**
 * Client should use TV shell, home hub, EPG caps, and spatial focus.
 * Native TV UA, Silk, Comfort layout, or coarse pointer on a big screen.
 * Tablets stay on mobile/desktop shell unless Comfort TV or a real TV UA.
 */
export function isLivingRoomClient(
  comfortTvBrowsing = false,
  uaOverride?: string
): boolean {
  if (typeof navigator === "undefined" && !uaOverride) return false;
  const ua = uaOverride ?? navigator.userAgent ?? "";
  const tvUa = uaOverride ? isTvClassUserAgent(ua) : detectTvBrowser();
  if (tvUa || isAmazonSilkUserAgent(ua) || comfortTvBrowsing) {
    return true;
  }
  if (isLikelyTabletDevice(ua)) {
    return false;
  }
  if (uaOverride) {
    return false;
  }
  return isCoarsePointerLargeScreen();
}
