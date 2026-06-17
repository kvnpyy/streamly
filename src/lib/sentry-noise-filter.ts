import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/** Tampermonkey/Greasemonkey userscripts and browser extensions. */
const THIRD_PARTY_FRAME_RE =
  /^(app:\/\/|chrome-extension:|moz-extension:|safari-extension:|safari-web-extension:)/i;

const THIRD_PARTY_FILENAME_RE = /\.user\.js$/i;

function framePath(frame: { filename?: string; abs_path?: string }): string {
  return (frame.filename ?? frame.abs_path ?? "").trim();
}

export function isThirdPartyScriptFrame(path: string): boolean {
  if (!path) return false;
  return THIRD_PARTY_FRAME_RE.test(path) || THIRD_PARTY_FILENAME_RE.test(path);
}

/** Drop extension/userscript errors before they reach Sentry. */
export function shouldDropSentryClientEvent(
  event: ErrorEvent,
  _hint?: EventHint
): boolean {
  const frames =
    event.exception?.values?.flatMap((v) => v.stacktrace?.frames ?? []) ?? [];
  if (frames.length === 0) return false;

  const hasInAppFrame = frames.some((f) => f.in_app === true);
  if (hasInAppFrame) return false;

  return frames.every((f) => isThirdPartyScriptFrame(framePath(f)));
}

/** denyUrls patterns for Sentry.init — belt-and-suspenders with beforeSend. */
export const SENTRY_DENY_URLS: Array<string | RegExp> = [
  /^app:\/\//i,
  /^chrome-extension:/i,
  /^moz-extension:/i,
  /^safari-extension:/i,
  /^safari-web-extension:/i,
  /\.user\.js$/i,
];
