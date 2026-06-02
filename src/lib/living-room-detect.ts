import { detectTvBrowser } from "@/lib/tv-browser";
import { isAmazonSilkUserAgent } from "@/lib/tv-user-agent";

/** Large screen + remote-style pointer (typical browser on a TV). */
export function isCoarsePointerLargeScreen(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse) and (min-width: 1024px)").matches;
}

/**
 * Client should use TV shell, home hub, EPG caps, and spatial focus.
 * Native TV UA, Silk, Comfort layout, or coarse pointer on a big screen.
 */
export function isLivingRoomClient(comfortTvBrowsing = false): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    detectTvBrowser() ||
    isAmazonSilkUserAgent(ua) ||
    comfortTvBrowsing ||
    isCoarsePointerLargeScreen()
  );
}
