import {
  categoryPassesRegionGate,
  collectRegionalShelfPreview,
} from "@/lib/live-category-shelf";
import type { TvRegion } from "@/lib/geo-continent";
import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import { lookupStreamIdsForCategory } from "@/lib/live-stream-index";
import type { ShelfPreviewPayload } from "@/lib/live-catalog-shelves";
import type { Category } from "@/lib/xtream-types";
import { NextRequest, NextResponse } from "next/server";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CATEGORIES = 8;
const MAX_PER_SHELF = 12;

function categoryById(
  categories: Category[],
  catId: string
): Category | undefined {
  return categories.find((c) => String(c.category_id) === catId);
}

/**
 * Batch shelf previews for Live TV browse — one disk read + one stream map per request.
 */
export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;

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

      const streams = collectRegionalShelfPreview(
        ids,
        (id) => byId.get(id),
        category.category_name,
        region,
        limit
      );
      if (!streams.length) continue;

      const total = counts[catId] ?? counts[String(Number(catId))] ?? ids.length;
      shelves[catId] = { streams, total };
    }

    return NextResponse.json({ shelves });
  } catch (err) {
    console.error("[live/shelves]", err);
    return NextResponse.json({ shelves: {}, catalogUnavailable: true });
  }
}
