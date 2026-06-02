import { NextRequest, NextResponse } from "next/server";
import { syncTmdbTrendingToDb } from "@/lib/discovery/tmdb-sync";

/**
 * POST /api/discovery/sync-tmdb?region=US
 *
 * Cron-friendly TMDB refresh. Requires `DISCOVERY_CRON_SECRET` header
 * when that env var is set.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.DISCOVERY_CRON_SECRET?.trim();
  if (secret) {
    const provided =
      req.headers.get("x-discovery-cron-secret") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const region = req.nextUrl.searchParams.get("region")?.trim() || "US";
  const result = await syncTmdbTrendingToDb(region);
  if (!result) {
    return NextResponse.json(
      { error: "TMDB_API_TOKEN not configured" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    region: result.region,
    movieCount: result.movieCount,
    tvCount: result.tvCount,
    syncedAt: result.syncedAt.toISOString(),
  });
}
