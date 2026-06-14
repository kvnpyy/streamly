import {
  categoryPassesRegionGate,
  collectRegionalShelfPreview,
} from "@/lib/live-category-shelf";
import type { TvRegion } from "@/lib/geo-continent";
import { getShelfCategoriesForRegion } from "@/lib/live-catalog-shelf-category-cache";
import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import { lookupStreamIdsForCategory } from "@/lib/live-stream-index";
import { liveCatalogDiskKey } from "@/lib/xtream-catalog-disk-cache";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COUNT = 24;
const MAX_PER_SHELF = 12;

import type { ShelfBatchItem } from "@/lib/live-catalog-shelf-batch";

function readCreds(req: NextRequest) {
  const server = req.headers.get("x-iptv-server");
  const username = req.headers.get("x-iptv-username");
  const password = req.headers.get("x-iptv-password");
  if (!server || !username || !password) return null;
  return { server: server.replace(/\/+$/, ""), username, password };
}

/**
 * One request per "Show more" — next category page + shelf previews.
 * Uses a single in-memory catalog load (no double disk parse).
 */
export async function GET(req: NextRequest) {
  const creds = readCreds(req);
  if (!creds) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const region = (req.nextUrl.searchParams.get("region")?.trim() ||
    "All") as TvRegion;
  const offsetRaw = Number(req.nextUrl.searchParams.get("offset"));
  const countRaw = Number(req.nextUrl.searchParams.get("count"));
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
  const count = Math.min(
    MAX_COUNT,
    Math.max(1, Number.isFinite(countRaw) ? countRaw : 4)
  );
  const limit = Math.min(
    MAX_PER_SHELF,
    Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 7)
  );

  try {
    const { bundle, index, streamById } = await getCachedLiveCatalogEntry(creds);
    const counts = bundle.countByCategoryId ?? {};
    const diskKey = liveCatalogDiskKey(creds);
    const filtered = getShelfCategoriesForRegion(
      diskKey,
      region,
      bundle.categories,
      counts,
      index
    );

    const page = filtered.slice(offset, offset + count);
    const shelves: ShelfBatchItem[] = [];

    for (const category of page) {
      const catId = String(category.category_id);
      if (!categoryPassesRegionGate(category.category_name, region)) continue;

      const ids = lookupStreamIdsForCategory(index, catId) ?? [];
      if (!ids.length) continue;

      const preview = collectRegionalShelfPreview(
        ids,
        (id) => streamById.get(id),
        category.category_name,
        region,
        limit
      );

      const total =
        preview.length > 0
          ? (counts[catId] ?? counts[String(Number(catId))] ?? ids.length)
          : 0;
      shelves.push({
        id: catId,
        title: category.category_name,
        preview,
        total,
      });
    }

    const nextOffset = offset + page.length;
    return NextResponse.json({
      shelves,
      nextOffset,
      hasMore: nextOffset < filtered.length,
      totalCategories: filtered.length,
    });
  } catch (err) {
    console.error("[live/shelf-batch]", err);
    return NextResponse.json(
      { error: "Could not load shelf batch." },
      { status: 502 }
    );
  }
}
