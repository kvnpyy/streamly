import { isLivingRoomClient } from "@/lib/living-room-detect";
import { isMobileShellWidth } from "@/lib/shell-layout";

export type HomeAutoRichHints = {
  env?: string | null;
  tvServerHint?: boolean;
  livingRoom?: boolean;
  mobileShell?: boolean;
  finePointer?: boolean;
  desktopWidth?: boolean;
};

/** Testable client hints for when home must not auto-load VOD/series shelves. */
export function isHomeAutoRichDisabledForHints(hints: HomeAutoRichHints): boolean {
  const v = hints.env?.trim();
  if (v === "0" || v === "false") return true;
  if (v === "1" || v === "true") return false;
  if (hints.tvServerHint) return true;
  if (hints.livingRoom) return true;
  if (hints.mobileShell) return true;
  if (hints.finePointer && hints.desktopWidth) return true;
  return false;
}

/** When false, home never auto-loads movie/series recommendation shelves. */
export function isHomeAutoRichDisabled(): boolean {
  if (typeof window === "undefined") return false;
  return isHomeAutoRichDisabledForHints({
    env: process.env.NEXT_PUBLIC_HOME_AUTO_RICH,
    tvServerHint: document.documentElement.classList.contains("tv-server-hint"),
    livingRoom: isLivingRoomClient(),
    mobileShell: isMobileShellWidth(),
    finePointer: window.matchMedia("(pointer: fine)").matches,
    desktopWidth: window.innerWidth >= 1024,
  });
}

/** Idle delay before auto-loading home recommendations (default on). */
export const HOME_AUTO_RICH_DELAY_MS = 8_000;
