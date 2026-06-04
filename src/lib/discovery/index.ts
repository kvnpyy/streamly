export { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
export {
  getDiscoveryRegion,
  discoveryRegionDisplayName,
  regionalTrendingShelfTitle,
  resolveTmdbCountry,
  tvRegionToTmdbCountry,
} from "@/lib/discovery/discovery-region";
export {
  appendCatalogFallbacks,
  buildRegionalTrending,
  shouldShowRegionalTrending,
  REGIONAL_TRENDING_MIN_ITEMS,
} from "@/lib/discovery/regional-trending";
export type {
  RegionalTrendingCard,
  RegionalTrendReason,
} from "@/lib/discovery/regional-trending-types";
export { DISCOVERY_SHELF_META } from "@/lib/discovery/shelf-meta";
export { pickLiveDiscoveryCandidateIds } from "@/lib/discovery/live-candidates";
export {
  localPrimeTimeWindowSec,
  snapshotFromListings,
  tonightProgramFromListings,
} from "@/lib/discovery/live-epg";
export {
  LIVE_DISCOVERY_MIN_ITEMS,
  LIVE_DISCOVERY_MAX_SCAN,
  scoreOnNowEntry,
  scoreTonightEntry,
  type ScoredLiveEntry,
} from "@/lib/discovery/live-scoring";
export {
  buildFeaturedLive,
  buildForYouMovies,
  buildForYouSeries,
  buildNewMovies,
  buildNewSeries,
  buildTmdbTrendingMovies,
  buildTmdbTrendingSeries,
  buildTopRatedMovies,
  buildTopRatedSeries,
} from "@/lib/discovery/scoring";
export {
  buildLiveTrendingOnTv,
  LIVE_TRENDING_ON_TV_MAX_SCAN,
  mergeTmdbTrendingLists,
} from "@/lib/discovery/live-trending-on-tv";
export {
  catalogTitleEntriesFromMovies,
  catalogTitleEntriesFromSeries,
  bestTmdbMatchForTitle,
  matchTmdbTrendingToCatalog,
} from "@/lib/discovery/tmdb-match";
export type {
  DiscoveryShelvesApiResponse,
  DiscoveryShelfId,
  DiscoveryShelfMeta,
  TmdbTrendingItem,
} from "@/lib/discovery/types";
