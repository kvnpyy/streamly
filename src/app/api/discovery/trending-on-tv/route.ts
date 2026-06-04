import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import {
  buildTrendingOnTvForAccount,
  type EpgTitleHint,
} from "@/lib/discovery/trending-on-tv-server";
import { isLiveTrendingShelfEnabled } from "@/lib/live-epg-policy";
import { parseTvRegion, type TvRegion } from "@/lib/geo-continent";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCreds(req: NextRequest) {
  const server = req.headers.get("x-iptv-server");
  const username = req.headers.get("x-iptv-username");
  const password = req.headers.get("x-iptv-password");
  if (!server || !username || !password) return null;
  return { server: server.replace(/\/+$/, ""), username, password };
}

function parsePriorityIds(raw: string | null): number[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function parseEpgHints(body: unknown): EpgTitleHint[] {
  if (!body || typeof body !== "object") return [];
  const hints = (body as { epgHints?: unknown }).epgHints;
  if (!Array.isArray(hints)) return [];
  const out: EpgTitleHint[] = [];
  for (const row of hints.slice(0, 800)) {
    if (!row || typeof row !== "object") continue;
    const streamId = Number((row as { streamId?: unknown }).streamId);
    const title =
      typeof (row as { title?: unknown }).title === "string"
        ? (row as { title: string }).title
        : "";
    if (!Number.isFinite(streamId) || streamId <= 0) continue;
    const trimmed = title.trim();
    if (!trimmed) continue;
    out.push({ streamId, title: trimmed });
  }
  return out;
}

async function handleTrendingOnTv(
  req: NextRequest,
  tvRegion: TvRegion,
  priorityStreamIds: number[],
  epgHints: EpgTitleHint[]
) {
  if (!isDiscoveryShelvesEnabled() || !isLiveTrendingShelfEnabled()) {
    return NextResponse.json({ enabled: false, items: [] });
  }

  const creds = readCreds(req);
  if (!creds) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const result = await buildTrendingOnTvForAccount(creds, tvRegion, {
      priorityStreamIds,
      epgHints,
    });
    const debug =
      process.env.NODE_ENV === "development" ||
      process.env.NEXT_PUBLIC_DISCOVERY_DEBUG === "1"
        ? {
            hintCount: epgHints.length,
            itemCount: result.items.length,
            cached: result.cached,
            tmdbCountry: result.tmdbCountry,
          }
        : undefined;
    return NextResponse.json(
      {
        enabled: true,
        tvRegion,
        tmdbCountry: result.tmdbCountry,
        cached: result.cached,
        items: result.items.map((e) => ({
          streamId: e.stream.stream_id,
          channelName: e.stream.name,
          programmeTitle: e.programmeTitle,
          detail: e.detail,
          icon: e.stream.stream_icon,
          directSource: e.stream.direct_source,
        })),
        ...(debug ? { _debug: debug } : {}),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trending on TV failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/discovery/trending-on-tv?region=North%20America
 * POST with optional `{ epgHints: [{ streamId, title }] }` from browser EPG cache.
 */
export async function GET(req: NextRequest) {
  const tvRegion = parseTvRegion(req.nextUrl.searchParams.get("region"));
  const priorityStreamIds = parsePriorityIds(
    req.nextUrl.searchParams.get("priorityIds")
  );
  return handleTrendingOnTv(req, tvRegion, priorityStreamIds, []);
}

export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const regionFromBody =
    body && typeof body === "object"
      ? (body as { region?: unknown }).region
      : null;
  const tvRegion = parseTvRegion(
    typeof regionFromBody === "string"
      ? regionFromBody
      : req.nextUrl.searchParams.get("region")
  );

  const priorityFromBody =
    body && typeof body === "object"
      ? (body as { priorityIds?: unknown }).priorityIds
      : null;
  const priorityStreamIds = Array.isArray(priorityFromBody)
    ? priorityFromBody
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
    : parsePriorityIds(req.nextUrl.searchParams.get("priorityIds"));

  const epgHints = parseEpgHints(body);
  return handleTrendingOnTv(req, tvRegion, priorityStreamIds, epgHints);
}
