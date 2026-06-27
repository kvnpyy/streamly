import { catalogKeys } from "@/lib/catalog-queries";
import { slimLiveCatalogQueryOptions } from "@/lib/live-catalog-query";
import { slimSeriesCatalogQueryOptions } from "@/lib/slim-series-catalog-query";
import { slimVodCatalogQueryOptions } from "@/lib/slim-vod-catalog-query";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { QueryClient } from "@tanstack/react-query";

export type TvHubPrefetchTarget =
  "/app/live" | "/app/movies" | "/app/series" | "/app/settings";

const LIVE = "/app/live" as const;
const MOVIES = "/app/movies" as const;
const SERIES = "/app/series" as const;

function warmLiveCatalog(creds: XtreamCredentials, qc: QueryClient) {
  if (qc.getQueryState(catalogKeys.live(creds))?.data) return;
  void qc.prefetchQuery(slimLiveCatalogQueryOptions(creds));
}

function warmMoviesCatalog(creds: XtreamCredentials, qc: QueryClient) {
  const key = [...catalogKeys.vodCatalog(creds), "slim"] as const;
  if (qc.getQueryState(key)?.data) return;
  void qc.prefetchQuery(slimVodCatalogQueryOptions(creds));
}

function warmSeriesCatalog(creds: XtreamCredentials, qc: QueryClient) {
  const key = [...catalogKeys.seriesCatalog(creds), "slim"] as const;
  if (qc.getQueryState(key)?.data) return;
  void qc.prefetchQuery(slimSeriesCatalogQueryOptions(creds));
}

/** Warm slim catalog metadata so hub → section navigation feels instant on TV. */
export function prefetchTvHubCatalogs(
  creds: XtreamCredentials,
  qc: QueryClient,
  target?: TvHubPrefetchTarget
) {
  if (!target) {
    warmLiveCatalog(creds, qc);
    warmMoviesCatalog(creds, qc);
    warmSeriesCatalog(creds, qc);
    return;
  }
  if (target === LIVE) warmLiveCatalog(creds, qc);
  else if (target === MOVIES) warmMoviesCatalog(creds, qc);
  else if (target === SERIES) warmSeriesCatalog(creds, qc);
}

export function prefetchTvHubRoutes(
  prefetch: (href: string) => void,
  target?: TvHubPrefetchTarget
) {
  const routes: TvHubPrefetchTarget[] = target
    ? [target]
    : [LIVE, MOVIES, SERIES, "/app/settings"];
  for (const href of routes) prefetch(href);
}

/** Call from hub tiles on D-pad focus — warms the destination before OK/Enter. */
export function prefetchTvHubTile(
  href: string,
  creds: XtreamCredentials,
  qc: QueryClient,
  router: { prefetch: (href: string) => void }
) {
  const target = href as TvHubPrefetchTarget;
  prefetchTvHubRoutes(router.prefetch.bind(router), target);
  prefetchTvHubCatalogs(creds, qc, target);
}
