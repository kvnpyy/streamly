import type { XtreamCredentials } from "@/lib/xtream-types";
import type { QueryClient } from "@tanstack/react-query";

export const CATALOG_STALE_MS = 1000 * 60 * 15;

export const catalogKeys = {
  live: (c: XtreamCredentials) =>
    ["live-catalog", c.server, c.username] as const,
  liveLegacy: (c: XtreamCredentials) =>
    ["live", c.server, c.username, "all"] as const,
  vod: (c: XtreamCredentials) => ["vod", c.server, c.username, "all"] as const,
  vodCatalog: (c: XtreamCredentials) =>
    ["vod-catalog", c.server, c.username] as const,
  vodCats: (c: XtreamCredentials) =>
    ["vod-cats", c.server, c.username] as const,
  series: (c: XtreamCredentials) =>
    ["series", c.server, c.username, "all"] as const,
  seriesCatalog: (c: XtreamCredentials) =>
    ["series-catalog", c.server, c.username] as const,
  seriesCats: (c: XtreamCredentials) =>
    ["series-cats", c.server, c.username] as const,
};

/** Invalidate browse caches after playlist switch — not the entire RQ tree. */
export function invalidateBrowseCatalogs(
  qc: QueryClient,
  creds: XtreamCredentials
): Promise<void> {
  return qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey;
      if (!Array.isArray(k) || k.length < 3) return false;
      if (k[1] !== creds.server || k[2] !== creds.username) return false;
      const head = k[0];
      return (
        head === "live-catalog" ||
        head === "live" ||
        head === "live-cats" ||
        head === "vod" ||
        head === "vod-cats" ||
        head === "vod-catalog" ||
        head === "series" ||
        head === "series-cats" ||
        head === "series-catalog"
      );
    },
  });
}
