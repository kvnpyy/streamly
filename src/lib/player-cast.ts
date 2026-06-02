import { isAppleMobileWebKitDevice } from "@/lib/browser";

export const CAST_SENDER_SCRIPT_SRC =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

/** Chromecast Web Sender only runs in Chromium-class desktop/Android browsers. */
export function shouldAttemptChromecastSenderLoad(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isAppleMobileWebKitDevice()) return false;
  const ua = navigator.userAgent || "";
  if (/\bFirefox\b/i.test(ua)) return false;
  if (/\bSafari\b/i.test(ua) && !/\bChrom(?:e|ium)\b/i.test(ua)) return false;
  return (
    /\bChrom(?:e|ium)\//i.test(ua) ||
    /\bEdg\//i.test(ua) ||
    /\bOPR\//i.test(ua) ||
    /\bBrave\b/i.test(ua)
  );
}
