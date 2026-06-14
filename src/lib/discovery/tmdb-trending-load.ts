import { resolveTmdbCountry } from "@/lib/discovery/tmdb-region";
import {
  readTmdbTrendingFromDb,
  syncTmdbTrendingToDb,
} from "@/lib/discovery/tmdb-sync";
import type { TmdbTrendingItem } from "@/lib/discovery/types";
import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";

const STALE_MS = 26 * 60 * 60 * 1000;

export async function loadTmdbTrendingForRegion(
  regionParam: string
): Promise<{
  movieTrending: TmdbTrendingItem[];
  tvTrending: TmdbTrendingItem[];
  trendingSynced: boolean;
}> {
  if (!isDiscoveryShelvesEnabled()) {
    return { movieTrending: [], tvTrending: [], trendingSynced: false };
  }

  const region =
    /^[A-Z]{2,3}$/i.test(regionParam.trim())
      ? regionParam.trim().toUpperCase()
      : resolveTmdbCountry({ tvRegion: regionParam as never });
  let { movieTrending, tvTrending, syncedAt } = await readTmdbTrendingFromDb(region);

  const stale = !syncedAt || Date.now() - syncedAt.getTime() > STALE_MS;
  if (stale && process.env.TMDB_API_TOKEN?.trim()) {
    try {
      const result = await syncTmdbTrendingToDb(region);
      if (result) {
        const fresh = await readTmdbTrendingFromDb(region);
        movieTrending = fresh.movieTrending;
        tvTrending = fresh.tvTrending;
        syncedAt = fresh.syncedAt;
      }
    } catch (err) {
      console.warn("[discovery] TMDB sync failed:", err);
    }
  }

  return {
    movieTrending,
    tvTrending,
    trendingSynced: movieTrending.length > 0 || tvTrending.length > 0,
  };
}

export function parseIdList(raw: string | null): number[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 40);
}
