import { isBraveBrowser } from "@/lib/browser";

/** Short guidance when Brave blocks or never loads the Cast sender. */
export function braveCastRecoveryHint(): string {
  return (
    "In Brave: enable Media Router at brave://settings/extensions, lower Shields " +
    "for this site, then refresh. Samsung TVs need Chromecast built-in (not Smart View). " +
    "Or copy the TV-safe stream URL / open Streamly on the TV."
  );
}

export function castSdkFailedMessage(): string {
  if (isBraveBrowser()) return braveCastRecoveryHint();
  return (
    "Cast didn’t load (blocked network, extension, or ad blocker). " +
    "Refresh, try Chrome or Edge, or copy the TV-safe stream URL. " +
    "Samsung TVs need Chromecast built-in."
  );
}

export function castSdkUnsupportedMessage(): string {
  return (
    "Use Chrome, Edge, or Brave on a computer or Android. On iPhone, use AirPlay. " +
    "Samsung casting requires Chromecast built-in on the TV."
  );
}

/** Map Cast SDK / chrome.cast error codes to user-facing copy. */
export function mapCastSessionError(err: unknown): string {
  const code = extractCastErrorCode(err);
  const description = extractCastErrorDescription(err);
  const cancel =
    code === "cancel" ||
    code === "canceled" ||
    code === "cancelled" ||
    /cancel/i.test(description ?? "");

  if (cancel) {
    return "Cast picker closed. Tap Cast again when you’re ready.";
  }

  if (
    code === "timeout" ||
    code === "session_error" ||
    /no.*device|device.*not.*found|receiver.*not/i.test(description ?? "")
  ) {
    const base =
      "No Chromecast devices found. Use the same Wi‑Fi as your TV. " +
      "Samsung needs Chromecast built-in (Smart View isn’t supported).";
    return isBraveBrowser()
      ? `${base} Also enable Media Router in Brave settings.`
      : base;
  }

  if (isBraveBrowser()) {
    return code
      ? `Cast failed (${code}). ${braveCastRecoveryHint()}`
      : braveCastRecoveryHint();
  }

  return code
    ? `Cast failed (${code}). Try again, use another Chromecast / Google TV, or copy the TV-safe stream URL.`
    : "Cast failed. Try again, move to the same Wi‑Fi as your TV, or copy the TV-safe stream URL.";
}

function extractCastErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const o = err as { code?: unknown; errorCode?: unknown };
  if (typeof o.code === "string" && o.code.trim()) return o.code.trim();
  if (typeof o.code === "number" && Number.isFinite(o.code)) return String(o.code);
  if (typeof o.errorCode === "string" && o.errorCode.trim()) {
    return o.errorCode.trim();
  }
  if (typeof o.errorCode === "number" && Number.isFinite(o.errorCode)) {
    return String(o.errorCode);
  }
  return null;
}

function extractCastErrorDescription(err: unknown): string | null {
  if (err instanceof Error && err.message) return err.message;
  if (!err || typeof err !== "object") return null;
  const o = err as { description?: unknown; message?: unknown };
  if (typeof o.description === "string") return o.description;
  if (typeof o.message === "string") return o.message;
  return null;
}
