import {
  buildVodDiscoveryShelvesPayload,
  type VodDiscoveryShelvesOpts,
} from "@/lib/vod-discovery-shelves-server";
import { getCachedVodCatalogEntry } from "@/lib/vod-catalog-server-cache";
import {
  loadTmdbTrendingForRegion,
  parseIdList,
} from "@/lib/discovery/tmdb-trending-load";
import { NextRequest, NextResponse } from "next/server";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Movies discovery shelves — built on the VPS from the cached catalog bundle.
 */
export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;

  const sp = req.nextUrl.searchParams;
  const hideAdult = sp.get("hideAdult") === "1";
  const parentalUnlocked = sp.get("parentalUnlocked") === "1";
  const recentIds = parseIdList(sp.get("recentIds"));
  const favoriteIds = parseIdList(sp.get("favoriteIds"));
  const region = sp.get("region")?.trim() || "US";

  try {
    const [{ bundle }, tmdb] = await Promise.all([
      getCachedVodCatalogEntry(creds),
      loadTmdbTrendingForRegion(region),
    ]);

    const opts: VodDiscoveryShelvesOpts = {
      hideAdult,
      parentalUnlocked,
      recentIds,
      favoriteIds,
      movieTrending: tmdb.movieTrending,
      tvTrending: tmdb.tvTrending,
      maxGenreShelves: 6,
    };

    const payload = buildVodDiscoveryShelvesPayload(bundle, opts);
    return NextResponse.json({
      ...payload,
      trendingSynced: tmdb.trendingSynced,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not build movie discovery shelves." },
      { status: 502 }
    );
  }
}
