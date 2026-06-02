import { getShelfCategoriesForRegion } from "@/lib/live-catalog-shelf-category-cache";
import type { TvRegion } from "@/lib/geo-continent";
import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import { liveCatalogDiskKey } from "@/lib/xtream-catalog-disk-cache";
import type { Category } from "@/lib/xtream-types";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 64;

function readCreds(req: NextRequest) {
  const server = req.headers.get("x-iptv-server");
  const username = req.headers.get("x-iptv-username");
  const password = req.headers.get("x-iptv-password");
  if (!server || !username || !password) return null;
  return { server: server.replace(/\/+$/, ""), username, password };
}

/**
 * Paginated IPTV categories for Live TV shelf browse (region + non-empty only).
 * Avoids scanning the full category list in the browser.
 */
export async function GET(req: NextRequest) {
  const creds = readCreds(req);
  if (!creds) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const region = (req.nextUrl.searchParams.get("region")?.trim() ||
    "All") as TvRegion;
  const offsetRaw = Number(req.nextUrl.searchParams.get("offset"));
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 32)
  );

  try {
    const { bundle, index } = await getCachedLiveCatalogEntry(creds);
    const counts = bundle.countByCategoryId ?? {};
    const filtered = getShelfCategoriesForRegion(
      liveCatalogDiskKey(creds),
      region,
      bundle.categories,
      counts,
      index
    );

    const page = filtered.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const hasMore = nextOffset < filtered.length;

    return NextResponse.json({
      categories: page,
      nextOffset,
      hasMore,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load shelf categories." },
      { status: 502 }
    );
  }
}
