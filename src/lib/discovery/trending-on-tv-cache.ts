import { shouldShowTrendingOnTvShelf } from "@/lib/discovery/live-trending-quality";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import { TRENDING_ON_TV_RESPONSE_TTL_MS } from "@/lib/epg-constants";

export type TrendingResponseCacheEntry = {
  items: ScoredLiveEntry[];
  tmdbCountry: string;
  at: number;
};

/**
 * Warm assembled-shelf cache is authoritative for the TTL window.
 * Browser EPG hints must not force a rebuild — that made every Live visit slow.
 */
export function shouldServeTrendingResponseCache(
  cached: TrendingResponseCacheEntry | undefined,
  now = Date.now(),
  ttlMs = TRENDING_ON_TV_RESPONSE_TTL_MS
): boolean {
  if (!cached) return false;
  if (now - cached.at >= ttlMs) return false;
  return shouldShowTrendingOnTvShelf(cached.items);
}
