/**
 * Shell chrome breakpoints — phone/tablet use bottom nav below `lg` (1024px).
 * Keeps sidebar + live in-page search aligned on the same threshold.
 */
export const SHELL_DESKTOP_MIN_WIDTH_PX = 1024;

/** Match media query for phone/tablet shell (bottom nav, no sidebar). */
export function mobileShellMediaQuery(): string {
  return `(max-width: ${SHELL_DESKTOP_MIN_WIDTH_PX - 1}px)`;
}

export function isMobileShellWidth(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(mobileShellMediaQuery()).matches;
}

/** Fired when app chrome height changes (e.g. Discord strip dismiss). */
export const CHROME_LAYOUT_SHIFT_EVENT = "streamly:chrome-layout-shift";

export function notifyChromeLayoutShift(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHROME_LAYOUT_SHIFT_EVENT));
}

/** Space reserved above the fixed mobile bottom nav (matches AppShell main padding). */
export const MOBILE_BOTTOM_NAV_CLEARANCE =
  "calc(4.25rem + env(safe-area-inset-bottom, 0px))";
