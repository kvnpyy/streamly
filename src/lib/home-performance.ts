/** Home page performance — heavy catalog/discovery is opt-in or deferred. */

/** When false, home never auto-loads movie/series recommendation shelves. */
export function isHomeAutoRichDisabled(): boolean {
  const v = process.env.NEXT_PUBLIC_HOME_AUTO_RICH?.trim();
  if (v === "0" || v === "false") return true;
  if (v === "1" || v === "true") return false;
  if (typeof window === "undefined") return false;
  /** Desktop mouse/trackpad: never auto-fetch shelves — user opts in via button. */
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const desktopWidth = window.innerWidth >= 1024;
  return finePointer && desktopWidth;
}

/** Idle delay before auto-loading home recommendations (default on). */
export const HOME_AUTO_RICH_DELAY_MS = 8_000;
