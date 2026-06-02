import { NextRequest, NextResponse } from "next/server";
import {
  readSportsEventsFromDb,
  syncSportsEventsToDb,
} from "@/lib/discovery/sports-sync";
import type { DiscoverySportsApiResponse } from "@/lib/discovery/sports-types";

const STALE_MS = 8 * 60 * 60 * 1000;

/**
 * GET /api/discovery/sports?region=US
 *
 * Returns cached MMA events (BALLDONTLIE). Refreshes when stale if
 * BALLDONTLIE_API_KEY is set.
 */
export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region")?.trim() || "US";
  const enabled =
    process.env.NEXT_PUBLIC_DISCOVERY_SHELVES !== "0" &&
    process.env.NEXT_PUBLIC_DISCOVERY_SHELVES !== "false";

  if (!enabled) {
    const body: DiscoverySportsApiResponse = {
      enabled: false,
      region,
      syncedAt: null,
      events: [],
    };
    return NextResponse.json(body);
  }

  let { events, syncedAt } = await readSportsEventsFromDb(region);

  const stale =
    !syncedAt || Date.now() - syncedAt.getTime() > STALE_MS;
  if (stale && process.env.BALLDONTLIE_API_KEY?.trim()) {
    try {
      const result = await syncSportsEventsToDb(region);
      if (result) {
        const fresh = await readSportsEventsFromDb(region);
        events = fresh.events;
        syncedAt = fresh.syncedAt;
      }
    } catch (err) {
      console.warn("[discovery] sports sync failed:", err);
    }
  }

  const body: DiscoverySportsApiResponse = {
    enabled: true,
    region,
    syncedAt: syncedAt?.toISOString() ?? null,
    events,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
