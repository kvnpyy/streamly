/** Stable shelf identifiers used across API + UI. */
export type DiscoveryShelfId =
  | "vod_top_rated_movies"
  | "vod_new_movies"
  | "vod_trending_movies"
  | "vod_for_you_movies"
  | "vod_top_rated_series"
  | "vod_new_series"
  | "vod_trending_series"
  | "vod_for_you_series"
  | "live_featured"
  | "live_on_now"
  | "live_tonight"
  | "live_sports_events"
  | "live_sports_on_guide"
  | "home_regional_trending";

export type DiscoveryMediaKind = "movie" | "series" | "live";

export type DiscoveryShelfMeta = {
  id: DiscoveryShelfId;
  title: string;
  eyebrow: string;
  /** Short honest explanation of the ranking signal. */
  signal: string;
  kind: DiscoveryMediaKind;
  seeAllHref?: string;
};

export type TmdbTrendingItem = {
  tmdbId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  popularity: number;
};

export type TmdbTrendingCachePayload = {
  items: TmdbTrendingItem[];
};

export type DiscoveryShelvesApiResponse = {
  enabled: boolean;
  region: string;
  syncedAt: string | null;
  movieTrending: TmdbTrendingItem[];
  tvTrending: TmdbTrendingItem[];
};
