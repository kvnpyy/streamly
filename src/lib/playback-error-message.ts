export type PlaybackErrorContext = "vod-transcode" | "live";

/** User-facing fallback when upstream returns HTML or other non-text garbage. */
export function playbackErrorFallback(
  status?: number,
  context: PlaybackErrorContext = "vod-transcode"
): string {
  if (status === 503) {
    return "Server is busy preparing this video. Wait a minute, then try again.";
  }
  if (status === 502) {
    return "Could not reach your provider for this file. Try again in a moment.";
  }
  if (status === 404 || status === 410) {
    return "This episode isn't available from your provider.";
  }
  if (status === 403) {
    return "Your provider blocked this request.";
  }
  if (context === "live") {
    return "Playback failed. Try again or pick another channel.";
  }
  return "Could not prepare this file for browser playback. Try again or use a native IPTV app.";
}

export function looksLikeHtmlOrMarkup(text: string): boolean {
  const t = text.trimStart().toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    t.includes("<html") ||
    t.includes("<!--[if") ||
    t.includes("</html>") ||
    t.includes("<head>") ||
    t.includes("<body")
  );
}

/**
 * Turn a stream-proxy / transcode error body into safe UI copy.
 * Never surface raw HTML (Cloudflare pages, nginx defaults, etc.).
 */
export function humanizePlaybackErrorResponse(
  raw: string | null | undefined,
  fallback: string,
  status?: number
): string {
  const text = raw?.trim() ?? "";
  if (!text) return fallback;
  if (looksLikeHtmlOrMarkup(text)) {
    return status != null ? playbackErrorFallback(status) : fallback;
  }
  try {
    const parsed = JSON.parse(text) as {
      errorText?: string;
      error?: string;
      message?: string;
    };
    const candidate = parsed.errorText ?? parsed.error ?? parsed.message;
    if (typeof candidate === "string") {
      const msg = candidate.trim();
      if (msg && !looksLikeHtmlOrMarkup(msg)) return msg.slice(0, 280);
    }
  } catch {
    /* plain text */
  }
  if (text.length > 280 || /<[a-z!/]/i.test(text)) {
    return status != null ? playbackErrorFallback(status) : fallback;
  }
  return text.slice(0, 280);
}
