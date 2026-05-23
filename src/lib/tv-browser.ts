import { isTvClassUserAgent } from "@/lib/tv-user-agent";

/**
 * Smart TV & console browsers (Samsung Tizen, LG webOS, Android TV, Fire TV Silk, etc.).
 * Uses the same rules as middleware UA detection — keep `tv-user-agent.ts` as source of truth.
 */
export function detectTvBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return isTvClassUserAgent(navigator.userAgent || "");
}
