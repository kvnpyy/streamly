/**
 * Safari/WebKit rejects failed fetches with TypeError "Load failed".
 * Chromium uses "Failed to fetch"; Firefox often "NetworkError when attempting to fetch resource."
 */
const NETWORK_ERROR_RE =
  /^(Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?|Network request failed)$/i;

export const CLIENT_NETWORK_ERROR_MESSAGE =
  "Network error. Check your connection and try again.";

export function isClientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "NetworkError") return true;
  return NETWORK_ERROR_RE.test(err.message.trim());
}

/** Map fetch/network failures to a stable UI string; otherwise return a fallback. */
export function clientErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (isClientNetworkError(err)) return CLIENT_NETWORK_ERROR_MESSAGE;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
