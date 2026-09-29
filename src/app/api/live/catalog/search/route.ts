import { parseTvRegion } from "@/lib/geo-continent";
import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import {
  resolveLiveSearchLimits,
  searchLiveCatalog,
} from "@/lib/live-catalog-search-server";
import { MIN_SEARCH_QUERY_LEN } from "@/lib/search-normalize";
import { NextRequest, NextResponse } from "next/server";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Full-catalog live channel search (name matches + capped scan pool for EPG).
 */
export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < MIN_SEARCH_QUERY_LEN) {
    return NextResponse.json(
      { error: "Search query is too short." },
      { status: 400 }
    );
  }

  const categoryId = req.nextUrl.searchParams.get("categoryId")?.trim() || "all";
  const tvRegion = parseTvRegion(req.nextUrl.searchParams.get("region"));
  const { matchLimit, scanPoolLimit } = resolveLiveSearchLimits(
    req.nextUrl.searchParams.get("matchLimit"),
    req.nextUrl.searchParams.get("scanLimit")
  );
  const hideAdult = req.nextUrl.searchParams.get("safe") === "1";

  try {
    const { bundle, index, streamById } = await getCachedLiveCatalogEntry(creds);
    const result = searchLiveCatalog(bundle, index, streamById, {
      q,
      categoryId,
      tvRegion,
      matchLimit,
      scanPoolLimit,
      hideAdult,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Could not search live channels." },
      { status: 502 }
    );
  }
}
