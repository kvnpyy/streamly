import { NextRequest } from "next/server";
import { getCountryIndex, lookupChannel } from "@/lib/external-epg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public-EPG fallback. Returns a JSON payload shaped like the rest of our
 * EPG endpoints (a top-level `epg_listings` array with the same fields
 * the Xtream API uses), so the client can plug it into the same hooks
 * without special-casing.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const name = (url.searchParams.get("name") || "").trim();
  const country = (url.searchParams.get("country") || "").trim();
  const limit = Math.max(1, Math.min(48, parseInt(url.searchParams.get("limit") || "8", 10) || 8));

  const empty = {
    epg_listings: [] as unknown[],
    source: "iptv-org-epg-pw",
    matched_name: null as string | null,
  };

  if (!name || !country) {
    return Response.json(empty);
  }

  let index;
  try {
    index = await getCountryIndex(country);
  } catch (err) {
    return Response.json({
      ...empty,
      error: err instanceof Error ? err.message : "external EPG fetch failed",
    });
  }
  if (!index) return Response.json(empty);

  const now = Math.floor(Date.now() / 1000);
  const futureSec = limit > 16 ? 48 * 60 * 60 : 24 * 60 * 60;
  const result = lookupChannel(
    index,
    name,
    now - 60 * 60, // include the past hour so "now playing" is detectable
    now + futureSec,
    limit
  );

  if (result.programmes.length === 0) {
    return Response.json({
      ...empty,
      matched_name: result.matchedName,
    });
  }

  return Response.json(
    {
      epg_listings: result.programmes.map((p, i) => ({
        id: `ext-${p.channelId}-${i}`,
        epg_id: `ext-${p.channelId}`,
        title: p.title,
        description: p.description ?? "",
        channel_id: p.channelId,
        start: new Date(p.start * 1000).toISOString(),
        end: new Date(p.end * 1000).toISOString(),
        start_timestamp: String(p.start),
        stop_timestamp: String(p.end),
        now_playing: p.start <= now && now < p.end ? 1 : 0,
      })),
      source: "iptv-org-epg-pw",
      matched_name: result.matchedName,
    },
    {
      headers: { "cache-control": "public, max-age=300" },
    }
  );
}
