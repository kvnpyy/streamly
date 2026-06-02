import { NextRequest, NextResponse } from "next/server";
import { syncSportsEventsToDb } from "@/lib/discovery/sports-sync";

/**
 * POST /api/discovery/sync-sports?region=US
 *
 * Cron-friendly BALLDONTLIE MMA events refresh.
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
  const result = await syncSportsEventsToDb(region);
  if (!result) {
    return NextResponse.json(
      { error: "BALLDONTLIE_API_KEY not configured" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    region: result.region,
    eventCount: result.eventCount,
    syncedAt: result.syncedAt.toISOString(),
  });
}
