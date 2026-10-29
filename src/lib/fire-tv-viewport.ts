/**
 * Fire TV Silk lays the page out around 960 CSS pixels and stretches that
 * across 1080p. `width=1920` with `maximum-scale=1` locks that stretch, so a
 * refresh still looks zoomed in. Leave the viewport at device-width and let
 * CSS zoom fit a narrow Silk window. Fire tablets (KF*) are not matched.
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

/** Unlocks a Fire TV browser that was pinned to a 1920px layout at scale 1. */
export const FIRE_TV_DEVICE_VIEWPORT =
  "width=device-width, initial-scale=1, viewport-fit=cover";

export function fireTvViewportContent(): string {
  return FIRE_TV_DEVICE_VIEWPORT;
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
  const current = (input.currentContent ?? "").trim();
  const locked =
    /width\s*=\s*1920\b/.test(current) || /maximum-scale\s*=\s*1\b/.test(current);
  if (!locked) return null;
  const next = "width=device-width, initial-scale=1, viewport-fit=cover";
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

/**
 * Scale that fits a narrow Silk layout onto the panel. Null when the viewport
 * is already about as wide as the TV. Self-contained so the boot script can
 * eval `toString()` without module bindings.
 */
export function fireTvFitZoom(input: {
  ua: string;
  innerWidth: number;
  screenWidth: number;
}): number | null {
  const ua = input.ua || "";
  const fireTv =
    /;\s*AFT[A-Z0-9]+\b/i.test(ua) ||
    (/\bsilk\b/i.test(ua) && /fire\s*tv|amazon\.fire|cloud_fire_tv/i.test(ua));
  if (!fireTv) return null;
  const screenWidth = input.screenWidth || 0;
  const inner = input.innerWidth || 0;
  if (inner <= 0) return null;
  const layout =
    screenWidth >= 1280 && screenWidth <= 1360 ? Math.round(screenWidth) : 1920;
  if (inner >= layout * 0.85) return null;
  let scale = Math.round((inner / layout) * 100) / 100;
  if (scale < 0.4) scale = 0.4;
  if (scale > 1) scale = 1;
  return scale;
}

export function fireTvViewportBootScript(): string {
  const viewportFn = resolveFireTvViewportBoot.toString();
  const zoomFn = fireTvFitZoom.toString();
  return `(function(){try{var ua=navigator.userAgent||"";var apply=function(){var inner=window.innerWidth||0;var screenW=(window.screen&&window.screen.width)||0;var meta=document.querySelector('meta[name="viewport"]');var current=meta?meta.getAttribute("content")||"":"";var next=(${viewportFn})({ua:ua,innerWidth:inner,screenWidth:screenW,currentContent:current});if(next){if(!meta){meta=document.createElement("meta");meta.setAttribute("name","viewport");(document.head||document.documentElement).appendChild(meta);}meta.setAttribute("content",next);}var zoom=(${zoomFn})({ua:ua,innerWidth:inner,screenWidth:screenW});if(zoom){var root=document.documentElement;root.style.zoom=String(zoom);root.style.width=Math.round(100/zoom)+"%";}};apply();document.addEventListener("DOMContentLoaded",apply);}catch(e){}})();`;
}
