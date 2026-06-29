import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import { xtreamCatalogCacheControlHeader } from "@/lib/xtream-catalog-cache";
import type { LiveCatalogBundle } from "@/lib/xtream";
import { NextRequest, NextResponse } from "next/server";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";

function slimCatalogBody(bundle: LiveCatalogBundle) {
  const counts =
    bundle.countByCategoryId ??
    (bundle.streamIdsByCategory
      ? Object.fromEntries(
          Object.entries(bundle.streamIdsByCategory).map(([k, ids]) => [
            k,
            ids?.length ?? 0,
          ])
        )
      : {});
  return {
    categories: bundle.categories,
    countByCategoryId: counts,
    streams: [],
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot live catalogue: categories + merged streams, normalized on the VPS.
 * Uses stale disk + in-memory cache when upstream is slow or unavailable.
 */
export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;

  const slim = req.headers.get("x-live-catalog-slim") === "1";

  try {
    const { bundle } = await getCachedLiveCatalogEntry(creds);
    const body = slim ? slimCatalogBody(bundle) : bundle;
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": xtreamCatalogCacheControlHeader(),
        "X-Live-Catalog-Source": "cache",
      },
    });
  } catch (e) {
    const aborted =
      e instanceof DOMException && e.name === "AbortError";
    if (aborted) {
      return NextResponse.json({ error: "Aborted" }, { status: 499 });
    }
    return NextResponse.json(
      {
        error:
          "Could not build the live channel list from your IPTV server. Try again in a moment.",
      },
      { status: 502 }
    );
  }
}
