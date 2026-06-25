/**
 * Rewrite upstream HLS manifests so every media URL is loaded via `/api/stream`
 * (prevents mixed content and provider CORS blocks on HTTPS pages).
 */

export function rewriteHlsManifest(
  text: string,
  manifestUrl: URL,
  opts: {
    compatMse: boolean;
    proxyOrigin?: string;
    forCast?: boolean;
  }
): string {
  const compatQs = opts.compatMse ? "&compat=mse" : "";
  const castQs = opts.forCast ? "&cast=1" : "";
  const prefix = opts.proxyOrigin?.replace(/\/+$/, "") ?? "";

  const upstreamStreamType = (upstreamAbs: string): "hls" | "vod" => {
    try {
      if (/\.m3u8(\?|$)/i.test(new URL(upstreamAbs).pathname)) return "hls";
    } catch {
      if (/\.m3u8(\?|$)/i.test(upstreamAbs)) return "hls";
    }
    return "vod";
  };

  const proxyLine = (upstreamAbs: string) => {
    const typeParam = opts.forCast ? upstreamStreamType(upstreamAbs) : "hls";
    const rel = `/api/stream?u=${encodeURIComponent(upstreamAbs)}&type=${typeParam}${compatQs}${castQs}`;
    return prefix ? `${prefix}${rel}` : rel;
  };

  const rewriteAbs = (raw: string): string => {
    const abs = new URL(raw.trim(), manifestUrl).toString();
    return proxyLine(abs);
  };

  const quotedUriRe = /URI="([^"]+)"/gi;
  const tagAttrUriRe = /\bURI=([^,\s"#]+)/gi;
  const bareHttpRe = /https?:\/\/[^\s"',]+/gi;

  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (!trimmed.startsWith("#")) {
        try {
          return rewriteAbs(trimmed);
        } catch {
          return line;
        }
      }

      let out = line;

      out = out.replace(quotedUriRe, (_m, uri: string) => {
        try {
          return `URI="${rewriteAbs(uri)}"`;
        } catch {
          return _m;
        }
      });

      out = out.replace(tagAttrUriRe, (match, uri: string) => {
        if (match.includes('URI="')) return match;
        if (!/^https?:\/\//i.test(uri) && !uri.startsWith("/")) return match;
        try {
          return `URI=${rewriteAbs(uri)}`;
        } catch {
          return match;
        }
      });

      if (/https?:\/\//i.test(out)) {
        out = out.replace(bareHttpRe, (match) => {
          try {
            return rewriteAbs(match);
          } catch {
            return match;
          }
        });
      }

      return out;
    })
    .join("\n");
}
