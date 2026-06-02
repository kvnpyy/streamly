import { NextRequest, NextResponse } from "next/server";
import { readTmdbTrendingFromDb, syncTmdbTrendingToDb } from "@/lib/discovery/tmdb-sync";
import type { DiscoveryShelvesApiResponse } from "@/lib/discovery/types";

const STALE_MS = 26 * 60 * 60 * 1000;

/**
 * GET /api/discovery/shelves?region=US
 *
 * Returns cached TMDB weekly trending lists for client-side matching
 * against the Xtream catalog. Auto-refreshes when cache is stale and
 * TMDB_API_TOKEN is configured.
 */
export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region")?.trim() || "US";
  const enabled =
    process.env.NEXT_PUBLIC_DISCOVERY_SHELVES !== "0" &&
    process.env.NEXT_PUBLIC_DISCOVERY_SHELVES !== "false";

  if (!enabled) {
    const body: DiscoveryShelvesApiResponse = {
      enabled: false,
      region,
      syncedAt: null,
      movieTrending: [],
      tvTrending: [],
    };
    return NextResponse.json(body);
  }

  let { movieTrending, tvTrending, syncedAt } = await readTmdbTrendingFromDb(region);

  const stale =
    !syncedAt || Date.now() - syncedAt.getTime() > STALE_MS;
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

  const body: DiscoveryShelvesApiResponse = {
    enabled: true,
    region,
    syncedAt: syncedAt?.toISOString() ?? null,
    movieTrending,
    tvTrending,
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
