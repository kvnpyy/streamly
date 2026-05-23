/** Browser-private cache for catalog/list Xtream actions (see `/api/xtream`). */
export const XTREAM_CATALOG_CACHE_MAX_AGE_SEC = 900;

const CATALOG_CACHE_ACTIONS = new Set([
  "get_live_categories",
  "get_vod_categories",
  "get_series_categories",
  "get_live_streams",
  "get_vod_streams",
  "get_series",
]);

export function isXtreamCatalogCacheAction(
  action: string | null | undefined
): boolean {
  if (action == null || action === "") return false;
  return CATALOG_CACHE_ACTIONS.has(action);
}

/**
 * `private` — safe default: shared CDNs must not reuse responses keyed only by URL
 * while credentials live in `x-iptv-*` headers. Browsers may reuse per their partitioning rules.
 */
export function xtreamCatalogCacheControlHeader(): string {
  const ma = XTREAM_CATALOG_CACHE_MAX_AGE_SEC;
  return `private, max-age=${ma}, stale-while-revalidate=${ma * 2}`;
}
