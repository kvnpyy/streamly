const MIN_RESPONSE_STATUS = 200;
const MAX_RESPONSE_STATUS = 599;

export function isValidHttpResponseStatus(status: number): boolean {
  return (
    Number.isInteger(status) &&
    status >= MIN_RESPONSE_STATUS &&
    status <= MAX_RESPONSE_STATUS
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
