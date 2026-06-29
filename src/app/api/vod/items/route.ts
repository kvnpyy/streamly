import {
  listVodItemsFromBundle,
  type VodCatalogSort,
} from "@/lib/vod-catalog-items-server";
import { getCachedVodCatalogEntry } from "@/lib/vod-catalog-server-cache";
import { NextRequest, NextResponse } from "next/server";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSort(raw: string | null): VodCatalogSort {
  if (raw === "rating" || raw === "name" || raw === "release_date") return raw;
  return "added";
}

/**
 * Paginated movie rows — full catalog stays on the VPS.
 */
export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;

  const sp = req.nextUrl.searchParams;
  const categoryId = sp.get("categoryId")?.trim() || "all";
  const offset = Number(sp.get("offset"));
  const limit = Number(sp.get("limit"));
  const sort = parseSort(sp.get("sort"));
  const q = sp.get("q")?.trim() ?? "";
  const lang = sp.get("lang")?.trim() ?? "";
  const idsParam = sp.get("ids")?.trim();
  const streamIds = idsParam
    ? idsParam
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    : undefined;

  try {
    const { bundle, streamById } = await getCachedVodCatalogEntry(creds);
    const page = listVodItemsFromBundle(bundle, streamById, {
      categoryId,
      offset,
      limit,
      sort,
      q,
      lang: lang || undefined,
      streamIds,
    });
    return NextResponse.json(page);
  } catch {
    return NextResponse.json(
      { error: "Could not load movies for this category." },
      { status: 502 }
    );
  }
}
