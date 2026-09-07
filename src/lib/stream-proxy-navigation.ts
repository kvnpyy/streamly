/**
 * Detect a real address-bar / new-tab navigation to `/api/stream`.
 * Media players, Chromecast, and hls.js XHR do not send these Fetch Metadata
 * values — they must still receive the playlist or bytes, not an HTML page.
 */
export function isBrowserDocumentNavigation(headers: {
  get(name: string): string | null;
}): boolean {
  const dest = (headers.get("sec-fetch-dest") ?? "").toLowerCase();
  if (dest === "document") return true;
  if (dest === "empty" || dest === "video" || dest === "audio") return false;

  const mode = (headers.get("sec-fetch-mode") ?? "").toLowerCase();
  if (mode === "navigate") return true;

  if (headers.get("range")) return false;
  if (dest) return false;

  const accept = (headers.get("accept") ?? "").toLowerCase();
  return accept.startsWith("text/html");
}
