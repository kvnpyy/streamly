/**
 * Same-origin image proxy helpers — never expose raw http(s) provider URLs to the browser
 * (avoids mixed-content blocks and console spam on https://iptvwebplayer.org).
 */

/** Resolve Xtream relative / protocol-relative media paths against the panel base URL. */
export function resolveProviderMediaUrl(
  raw: string | undefined | null,
  panelServer: string
): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `http:${t}`;
  const base = panelServer.replace(/\/+$/, "");
  if (t.startsWith("/")) return `${base}${t}`;
  return `${base}/${t}`;
}

/**
 * Build a same-origin `/api/img` URL for a provider poster/logo.
 * Optional `panelServer` resolves relative paths from the Xtream panel.
 */
export function buildImageProxy(
  url?: string | null,
  panelServer?: string | null
): string | undefined {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/api/img")) return trimmed;

  const resolved = panelServer
    ? resolveProviderMediaUrl(trimmed, panelServer)
    : trimmed;

  if (!resolved) return undefined;
  if (!/^https?:\/\//i.test(resolved)) return undefined;

  return `/api/img?u=${encodeURIComponent(resolved)}`;
}

/** CSS `background-image` value — only allows our proxied path (never raw http). */
export function proxiedCssBackground(
  url?: string | null,
  panelServer?: string | null
): string | undefined {
  const src = buildImageProxy(url, panelServer);
  if (!src?.startsWith("/api/img?")) return undefined;
  const escaped = src.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `url("${escaped}")`;
}

/** Absolute same-origin URL for Media Session / Cast artwork metadata. */
export function buildImageProxyAbsolute(
  url?: string | null,
  panelServer?: string | null
): string | undefined {
  const rel = buildImageProxy(url, panelServer);
  if (!rel || typeof window === "undefined") return rel;
  try {
    return new URL(rel, window.location.origin).href;
  } catch {
    return undefined;
  }
}
