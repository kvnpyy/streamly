import { parseTvRegion } from "@/lib/geo-continent";
import { filterStreamsForTvRegion } from "@/lib/live-category-shelf";
import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import { materializeStreamIds } from "@/lib/live-catalog-stream-map";
import { collectRegionalChannelSample } from "@/lib/live-regional-channel-sample";
import { lookupStreamIdsForCategory } from "@/lib/live-stream-index";
import { LIVE_GUIDE_MAX_CHANNELS, LIVE_LIST_MAX_CHANNELS } from "@/lib/live-guide-limits";
import type { LiveStream } from "@/lib/xtream-types";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = LIVE_LIST_MAX_CHANNELS;

function readCreds(req: NextRequest) {
  const server = req.headers.get("x-iptv-server");
  const username = req.headers.get("x-iptv-username");
  const password = req.headers.get("x-iptv-password");
  if (!server || !username || !password) return null;
  return { server: server.replace(/\/+$/, ""), username, password };
}

function idsForAll(
  index: Record<string, number[]>,
  limit: number
): number[] {
  const out: number[] = [];
  for (const ids of Object.values(index)) {
    if (!ids?.length) continue;
    for (let i = 0; i < ids.length && out.length < limit; i++) {
      out.push(ids[i]!);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Returns at most `limit` channel rows for one category (or explicit stream ids).
 * Full catalog stays on the server — the browser never walks 50k+ streams.
 */
export async function GET(req: NextRequest) {
  const creds = readCreds(req);
  if (!creds) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(limitRaw) ? limitRaw : LIVE_GUIDE_MAX_CHANNELS)
  );
  const idsParam = req.nextUrl.searchParams.get("ids")?.trim();
  const categoryId = req.nextUrl.searchParams.get("categoryId")?.trim() || "all";
  const tvRegion = parseTvRegion(req.nextUrl.searchParams.get("region"));

  try {
    const { bundle, index, streamById } = await getCachedLiveCatalogEntry(creds);

    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      return NextResponse.json({
        streams: materializeStreamIds(streamById, ids, limit),
      });
    }

    if (!index || !Object.keys(index).length) {
      const cid = categoryId === "all" ? null : String(categoryId);
      const out: LiveStream[] = [];
      for (const s of bundle.streams) {
        if (out.length >= limit) break;
        if (cid === null || String(s.category_id) === cid) out.push(s);
      }
      return NextResponse.json({ streams: out });
    }

    if (categoryId === "all" && tvRegion !== "All") {
      const regional = collectRegionalChannelSample(
        creds,
        tvRegion,
        bundle,
        index,
        streamById,
        limit
      );
      if (regional.length > 0) {
        return NextResponse.json({ streams: regional });
      }
    }

    const ids =
      categoryId === "all"
        ? idsForAll(index, limit)
        : lookupStreamIdsForCategory(index, categoryId) ?? [];

    let streams = materializeStreamIds(streamById, ids, limit);

    if (categoryId !== "all" && tvRegion !== "All") {
      const categoryName =
        bundle.categories.find((c) => String(c.category_id) === categoryId)
          ?.category_name ?? "";
      streams = filterStreamsForTvRegion(streams, tvRegion, categoryName).slice(
        0,
        limit
      );
    }

    return NextResponse.json({ streams });
  } catch {
    return NextResponse.json(
      { error: "Could not load channels for this category." },
      { status: 502 }
    );
  }
}
