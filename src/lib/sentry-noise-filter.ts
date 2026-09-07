import type { ErrorEvent } from "@sentry/nextjs";

/** Tampermonkey/Greasemonkey userscripts and browser extensions. */
const THIRD_PARTY_FRAME_RE =
  /^(app:\/\/|chrome-extension:|moz-extension:|safari-extension:|safari-web-extension:)/i;

const THIRD_PARTY_FILENAME_RE = /\.user\.js$/i;

const RSC_MANIFEST_RE = /React Client Manifest/i;

const NETWORK_LOAD_RE =
  /^(Load failed|Failed to fetch|NetworkError when attempting to fetch resource)/i;

function framePath(frame: { filename?: string; abs_path?: string }): string {
  return (frame.filename ?? frame.abs_path ?? "").trim();
}

export function isThirdPartyScriptFrame(path: string): boolean {
  if (!path) return false;
  return THIRD_PARTY_FRAME_RE.test(path) || THIRD_PARTY_FILENAME_RE.test(path);
}

const CLIENT_DISCONNECT_RE =
  /failed to pipe response|other side closed|ResponseAborted|ECONNRESET|EPIPE|ERR_STREAM_PREMATURE_CLOSE/i;

const SAFARI_NOT_FOUND_RE =
  /removeChild|object can not be found here|The node to be removed/i;

export function shouldDropSentryException(type: string, value: string): boolean {
  if (RSC_MANIFEST_RE.test(value)) return true;
  if (type === "ResponseAborted") return true;
  if (type === "AbortError") return true;
  if (type === "SocketError") return true;
  if (type === "TypeError" && /^terminated$/i.test(value.trim())) return true;
  if (CLIENT_DISCONNECT_RE.test(type) || CLIENT_DISCONNECT_RE.test(value)) {
    return true;
  }
  if (type === "NotFoundError" && SAFARI_NOT_FOUND_RE.test(value)) return true;
  if (type === "TypeError" && NETWORK_LOAD_RE.test(value)) return true;
  return false;
}

type SentryExceptionLike = {
  type?: string;
  value?: string;
  stacktrace?: {
    frames?: Array<{
      filename?: string;
      abs_path?: string;
      in_app?: boolean;
    }>;
  };
};

/** Drop extension/userscript errors before they reach Sentry. */
export function shouldDropSentryClientEvent(event: ErrorEvent): boolean {
  return shouldDropSentryEvent(event);
}

export function shouldDropSentryEvent(event: {
  exception?: { values?: SentryExceptionLike[] };
}): boolean {
  const values = event.exception?.values ?? [];
  for (const value of values) {
    if (shouldDropSentryException(value.type ?? "", value.value ?? "")) {
      return true;
    }
  }

  const frames = values.flatMap((v) => v.stacktrace?.frames ?? []);
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
