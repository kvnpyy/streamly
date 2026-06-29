import { xtreamCatalogCacheControlHeader } from "@/lib/xtream-catalog-cache";
import { slimSeriesCatalogBody } from "@/lib/slim-vod-catalog";
import { getCachedSeriesCatalogEntry } from "@/lib/vod-catalog-server-cache";
import { NextRequest, NextResponse } from "next/server";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;

  const slim =
    req.headers.get("x-series-catalog-slim") === "1" ||
    req.nextUrl.searchParams.get("slim") === "1";

  try {
    const { bundle } = await getCachedSeriesCatalogEntry(creds);
    const body = slim ? slimSeriesCatalogBody(bundle) : bundle;
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": xtreamCatalogCacheControlHeader(),
        "X-Series-Catalog-Source": "cache",
      },
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    if (aborted) {
      return NextResponse.json({ error: "Aborted" }, { status: 499 });
    }
    return NextResponse.json(
      { error: "Could not build the series catalog from your IPTV server." },
      { status: 502 }
    );
  }
}
