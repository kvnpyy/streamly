import {
  hydrateServerEpgCache,
  listFreshServerEpgTitles,
} from "@/lib/epg-server-title-cache";
import { parseTvRegion } from "@/lib/geo-continent";
import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import { streamsInScope } from "@/lib/live-catalog-search-server";
import { getOnAirGuide } from "@/lib/on-air-guide-server";
import { searchOnAirGuide } from "@/lib/on-air-guide";
import { MIN_SEARCH_QUERY_LEN } from "@/lib/search-normalize";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Search the provider TV guide for programmes on now or starting soon,
 * then return the playlist channels that carry them.
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
  const hideAdult = req.nextUrl.searchParams.get("safe") === "1";

  try {
    const [{ bundle, index, streamById }] = await Promise.all([
      getCachedLiveCatalogEntry(creds),
      hydrateServerEpgCache(creds),
    ]);
    const inScope = streamsInScope(
      bundle,
      index,
      streamById,
      categoryId,
      tvRegion
    );
    const guide = await getOnAirGuide(creds, bundle.streams ?? []);
    const categoryNameById = new Map(
      (bundle.categories ?? []).map((c) => [
        String(c.category_id),
        c.category_name,
      ])
    );
    const hits = searchOnAirGuide(guide, {
      q,
      nowSec: Math.floor(Date.now() / 1000),
      streamById,
      allowedIds: new Set(inScope.map((s) => s.stream_id)),
      hideAdult,
      categoryNameById,
      cachedTitles: listFreshServerEpgTitles(creds),
    });

    return NextResponse.json({
      matches: hits.map(({ stream, title, slot, start, end }) => ({
        stream,
        title,
        slot,
        start,
        end,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not search the TV guide." },
      { status: 502 }
    );
  }
}
