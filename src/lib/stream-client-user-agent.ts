/**
 * Gate who may call `/api/stream` by inbound User-Agent (abuse reduction).
 * Real browsers and embedded WebViews send `Mozilla/...`; upstream fetch uses a
 * different spoofed UA — this only inspects the client request.
 */

export function isAllowedStreamProxyUserAgent(
  userAgent: string,
  extraSubstrings: readonly string[]
): boolean {
  const ua = userAgent.trim();
  if (!ua) return false;
  if (/^Mozilla\//i.test(ua)) return true;
  const lower = ua.toLowerCase();
  for (const sub of extraSubstrings) {
    const s = sub.trim();
    if (!s) continue;
    if (lower.includes(s.toLowerCase())) return true;
  }
  return false;
}

export function streamProxyUaAllowExtraFromEnv(): string[] {
  const raw = process.env.STREAM_PROXY_UA_ALLOW_EXTRA ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isStreamProxyUaCheckDisabled(): boolean {
  return process.env.STREAM_PROXY_UA_CHECK_DISABLED === "1";
}
