/** Response / log correlation for `/api/stream` (support + slow-upstream logs). */
export const STREAM_PROXY_REQUEST_ID_HEADER = "x-request-id";

export function newRequestId(): string {
  return crypto.randomUUID();
}
