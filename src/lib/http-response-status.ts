const MIN_RESPONSE_STATUS = 200;
const MAX_RESPONSE_STATUS = 599;

/**
 * Fetch `Response` in Node (undici) rejects 304 — it is a cache revalidation
 * code, not a constructible application status. Next.js route handlers throw
 * `TypeError: Response constructor: Invalid response status code 304`.
 */
const RESPONSE_CTOR_BLOCKED = new Set([304]);

export function isValidHttpResponseStatus(status: number): boolean {
  return (
    Number.isInteger(status) &&
    status >= MIN_RESPONSE_STATUS &&
    status <= MAX_RESPONSE_STATUS &&
    !RESPONSE_CTOR_BLOCKED.has(status)
  );
}

export function coerceHttpResponseStatus(
  status: number,
  fallback = 502
): number {
  if (isValidHttpResponseStatus(status)) return status;
  if (isValidHttpResponseStatus(fallback)) return fallback;
  return 500;
}
