import { parseTvRegion } from "@/lib/geo-continent";
import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import {
  LIVE_SEARCH_MATCH_LIMIT,
  LIVE_SEARCH_SCAN_POOL_LIMIT,
  searchLiveCatalog,
} from "@/lib/live-catalog-search-server";
import { NextRequest, NextResponse } from "next/server";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_QUERY_LEN = 1;

/**
 * Full-catalog live channel search (name matches + capped scan pool for EPG).
 */
export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json(
      { error: "Search query is too short." },
      { status: 400 }
    );
  }

  const categoryId = req.nextUrl.searchParams.get("categoryId")?.trim() || "all";
  const tvRegion = parseTvRegion(req.nextUrl.searchParams.get("region"));
  const matchLimitRaw = Number(req.nextUrl.searchParams.get("matchLimit"));
  const scanLimitRaw = Number(req.nextUrl.searchParams.get("scanLimit"));
  const matchLimit = Number.isFinite(matchLimitRaw)
    ? Math.min(LIVE_SEARCH_MATCH_LIMIT, Math.max(1, matchLimitRaw))
    : LIVE_SEARCH_MATCH_LIMIT;
  const scanPoolLimit = Number.isFinite(scanLimitRaw)
    ? Math.min(
        LIVE_SEARCH_SCAN_POOL_LIMIT,
        Math.max(matchLimit, scanLimitRaw)
      )
    : LIVE_SEARCH_SCAN_POOL_LIMIT;

  try {
    const { bundle, index, streamById } = await getCachedLiveCatalogEntry(creds);
    const result = searchLiveCatalog(bundle, index, streamById, {
      q,
      categoryId,
      tvRegion,
      matchLimit,
      scanPoolLimit,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Could not search live channels." },
      { status: 502 }
    );
  }
}
