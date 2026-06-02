import type { MediaShelfItem } from "@/components/MediaShelf";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import type { LiveStream } from "@/lib/xtream-types";

/** Internal scoring reasons — surfaced as honest subtitle copy. */
export type RegionalTrendReason =
  | "tmdb_movie"
  | "tmdb_series"
  | "sports_main"
  | "sports_card"
  | "on_now_hype"
  | "tonight_prime"
  | "finale"
  | "catalog_top_movie"
  | "catalog_new_series"
  | "catalog_featured_live";

export type RegionalTrendingCard = {
  key: string;
  kind: "movie" | "series" | "live";
  title: string;
  /** One-line honest signal (not a generic “popular”). */
  signal: string;
  reason: RegionalTrendReason;
  score: number;
  poster?: string;
  badge?: string;
  href?: string;
  rating?: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Live-only: channel to tune. */
  liveEntry?: ScoredLiveEntry;
  stream?: LiveStream;
};

export type RegionalTrendingBuildInput = {
  region: string;
  tmdbMovies: MediaShelfItem[];
  tmdbSeries: MediaShelfItem[];
  /** TMDB popularity for score normalization (same order as matched catalog). */
  tmdbMoviePopularity: number[];
  tmdbSeriesPopularity: number[];
  sportsEvents: ScoredLiveEntry[];
  onNow: ScoredLiveEntry[];
  tonight: ScoredLiveEntry[];
  limit?: number;
};
