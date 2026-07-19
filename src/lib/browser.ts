/** True for Safari / iOS WebKit — excludes Chromium, CriOS, FxiOS, Edg. */
export function isSafariFamilyWithoutChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/\bChrom(?:e|ium)\b|\bEdg\//i.test(ua)) return false;
  if (/\bCriOS\b|\bFxiOS\b/i.test(ua)) return false;
  return /\bSafari\//i.test(ua);
}

/** Real iPhone/iPad WebKit (incl. iPadOS desktop UA and “Request Desktop Website”). */
export function isAppleMobileWebKitDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPod|iPad/.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return true;
  }
  if (
    typeof document !== "undefined" &&
    "ontouchend" in document &&
    navigator.maxTouchPoints > 1 &&
    /Macintosh|Mac OS X/.test(ua)
  ) {
    return true;
  }
  return false;
}

/** Desktop Chromium (Chrome, Brave, Edge, Opera) — strict MSE codec limits vs Safari/Firefox. */
export function isChromiumBasedDesktopBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|webOS|iPhone|iPad|iPod|Mobile\b/i.test(ua)) return false;
  const isFirefox = /\bFirefox\//.test(ua);
  const isSafariDesktop =
    /\bSafari\//.test(ua) &&
    !/\bChrome\//.test(ua) &&
    !/\bChromium\//.test(ua) &&
    !/\bEdg\//.test(ua);
  const isChromium =
    /\bChrome\//.test(ua) ||
    /\bChromium\//.test(ua) ||
    /\bEdg\//.test(ua) ||
    /\bBrave\//.test(ua) ||
    /\bOPR\//.test(ua);
  return isChromium && !isFirefox && !isSafariDesktop;
}

/** Shown under playback errors on Chromium when extensions often block MSE/hls.js. */
export function chromiumWalletExtensionPlaybackHint(): string | null {
  if (!isChromiumBasedDesktopBrowser()) return null;
  return "Wallet or privacy extensions can block playback in Chrome — try Incognito with extensions off.";
}

/**
 * Brave desktop/Android. Prefer `navigator.brave`; UA alone is unreliable
 * (Brave often reports as Chrome).
 */
export function isBraveBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    brave?: { isBrave?: () => Promise<boolean> };
  };
  if (nav.brave && typeof nav.brave.isBrave === "function") return true;
  const ua = navigator.userAgent || "";
  return /\bBrave\b/i.test(ua);
}
