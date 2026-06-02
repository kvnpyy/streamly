import { categoryPassesRegionGate } from "@/lib/live-category-shelf";
import type { TvRegion } from "@/lib/geo-continent";
import { getCategoryRegion } from "@/lib/geo-continent";
import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import { materializeStreamIds } from "@/lib/live-catalog-stream-map";
import { lookupStreamIdsForCategory } from "@/lib/live-stream-index";
import type { ShelfPreviewPayload } from "@/lib/live-catalog-shelves";
import type { Category, LiveStream } from "@/lib/xtream-types";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CATEGORIES = 8;
const MAX_PER_SHELF = 12;

function readCreds(req: NextRequest) {
  const server = req.headers.get("x-iptv-server");
  const username = req.headers.get("x-iptv-username");
  const password = req.headers.get("x-iptv-password");
  if (!server || !username || !password) return null;
  return { server: server.replace(/\/+$/, ""), username, password };
}

function categoryById(
  categories: Category[],
  catId: string
): Category | undefined {
  return categories.find((c) => String(c.category_id) === catId);
}

function filterPreviewForRegion(
  streams: LiveStream[],
  categoryName: string,
  region: TvRegion,
  limit: number
): LiveStream[] {
  if (region === "All") return streams.slice(0, limit);
  const catRegion = getCategoryRegion(categoryName);
  if (catRegion !== null && catRegion === region) {
    return streams.slice(0, limit);
  }
  const out: LiveStream[] = [];
  for (const s of streams) {
    if (out.length >= limit) break;
    const chRegion = getCategoryRegion(s.name);
    if (chRegion === null || chRegion === region) out.push(s);
  }
  return out;
}

/**
 * Batch shelf previews for Live TV browse — one disk read + one stream map per request.
 */
export async function GET(req: NextRequest) {
  const creds = readCreds(req);
  if (!creds) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const rawIds = req.nextUrl.searchParams.get("categoryIds")?.trim() ?? "";
  const categoryIds = rawIds
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, MAX_CATEGORIES);
  if (categoryIds.length === 0) {
    return NextResponse.json({ shelves: {} });
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Math.min(
    MAX_PER_SHELF,
    Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 7)
  );
  const region = (req.nextUrl.searchParams.get("region")?.trim() ||
    "All") as TvRegion;

  try {
    const { bundle, index, streamById: byId } = await getCachedLiveCatalogEntry(creds);
    const counts = bundle.countByCategoryId ?? {};
    const shelves: Record<string, ShelfPreviewPayload> = {};

    for (const catId of categoryIds) {
      const category = categoryById(bundle.categories, catId);
      if (!category) continue;
      if (!categoryPassesRegionGate(category.category_name, region)) continue;

      const ids = lookupStreamIdsForCategory(index, catId) ?? [];
      if (!ids.length) continue;

      const fetchCap = Math.min(ids.length, limit * 6);
      const raw = materializeStreamIds(byId, ids, fetchCap);
      const streams = filterPreviewForRegion(
        raw,
        category.category_name,
        region,
        limit
      );
      if (!streams.length) continue;

      const total = counts[catId] ?? counts[String(Number(catId))] ?? ids.length;
      shelves[catId] = { streams, total };
    }

    return NextResponse.json({ shelves });
  } catch {
    return NextResponse.json(
      { error: "Could not load shelf previews." },
      { status: 502 }
    );
  }
}
