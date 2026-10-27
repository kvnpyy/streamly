/**
 * Fire TV Silk (Fire Stick, Fire TV Cube) lays the page out around 960 CSS
 * pixels and stretches that across 1080p. The UI looks zoomed in, and D-pad
 * focus magnifies it further. Pin the layout width to the panel and lock
 * scale so navigation cannot pinch-zoom.
 *
 * Fire tablets (KF* Silk) are not matched — they keep device-width.
 */

export const FIRE_TV_WIDE_LAYOUT_PX = 1920;
export const FIRE_TV_COMPACT_LAYOUT_PX = 1280;

export function isFireTvBrowserUa(ua: string): boolean {
  if (!ua) return false;
  // Real Silk UAs look like "AFTMM Build/…)", not "AFTMM)".
  if (/;\s*AFT[A-Z0-9]+\b/i.test(ua)) return true;
  return (
    /\bsilk\b/i.test(ua) && /fire\s*tv|amazon\.fire|cloud_fire_tv/i.test(ua)
  );
}

/**
 * 720p Fire TV reports a panel around 1280. Laptop logical widths (1366–1600)
 * are not 720p, so they stay on the 1080p layout.
 */
export function fireTvLayoutWidth(screenWidth: number): number {
  if (screenWidth >= FIRE_TV_COMPACT_LAYOUT_PX && screenWidth <= 1360) {
    return Math.round(screenWidth);
  }
  return FIRE_TV_WIDE_LAYOUT_PX;
}

export function fireTvViewportContent(layoutWidth: number): string {
  const width = Math.min(
    FIRE_TV_WIDE_LAYOUT_PX,
    Math.max(FIRE_TV_COMPACT_LAYOUT_PX, Math.round(layoutWidth) || FIRE_TV_WIDE_LAYOUT_PX)
  );
  return `width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`;
}

/**
 * beforeInteractive boot. Self-contained: `toString()` is eval'd in the page
 * and must not close over module bindings.
 */
export function resolveFireTvViewportBoot(input: {
  ua: string;
  innerWidth: number;
  screenWidth: number;
  currentContent?: string | null;
}): string | null {
  const ua = input.ua || "";
  const fireTv =
    /;\s*AFT[A-Z0-9]+\b/i.test(ua) ||
    (/\bsilk\b/i.test(ua) && /fire\s*tv|amazon\.fire|cloud_fire_tv/i.test(ua));
  if (!fireTv) return null;
  const screenWidth = input.screenWidth;
  const layout =
    screenWidth >= 1280 && screenWidth <= 1360 ? Math.round(screenWidth) : 1920;
  const width = Math.min(1920, Math.max(1280, Math.round(layout) || 1920));
  const next = `width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`;
  const current = (input.currentContent ?? "").trim();
  if (current.replace(/\s+/g, "") === next.replace(/\s+/g, "")) return null;
  return next;
}

export function resolveFireTvViewport(input: {
  ua: string;
  innerWidth: number;
  screenWidth: number;
  currentContent?: string | null;
}): string | null {
  return resolveFireTvViewportBoot(input);
}

export function fireTvViewportBootScript(): string {
  const fn = resolveFireTvViewportBoot.toString();
  return `(function(){try{var meta=document.querySelector('meta[name="viewport"]');var current=meta?meta.getAttribute("content")||"":"";var next=(${fn})({ua:navigator.userAgent||"",innerWidth:window.innerWidth||0,screenWidth:(window.screen&&window.screen.width)||0,currentContent:current});if(!next)return;if(!meta){meta=document.createElement("meta");meta.setAttribute("name","viewport");(document.head||document.documentElement).appendChild(meta);}meta.setAttribute("content",next);}catch(e){}})();`;
}
