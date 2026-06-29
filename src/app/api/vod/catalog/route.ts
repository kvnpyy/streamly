import {
  catalogDiskKey,
  readCatalogDisk,
  writeCatalogDisk,
} from "@/lib/xtream-catalog-disk-cache";
import { xtreamCatalogCacheControlHeader } from "@/lib/xtream-catalog-cache";
import { slimVodCatalogBody } from "@/lib/slim-vod-catalog";
import { fetchVodCatalogOnServer } from "@/lib/xtream-server-vod-catalog";
import type { VodCatalogBundle } from "@/lib/vod-catalog-bundle";
import { NextRequest, NextResponse } from "next/server";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;

  const diskKey = catalogDiskKey("vod", creds);
  const slim =
    req.headers.get("x-vod-catalog-slim") === "1" ||
    req.nextUrl.searchParams.get("slim") === "1";

  const diskHit = await readCatalogDisk<VodCatalogBundle>(diskKey);
  if (diskHit) {
    const body = slim ? slimVodCatalogBody(diskHit) : diskHit;
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": xtreamCatalogCacheControlHeader(),
        "X-Vod-Catalog-Source": "disk",
      },
    });
  }

  try {
    const bundle = await fetchVodCatalogOnServer(creds, { signal: req.signal });
    void writeCatalogDisk(diskKey, bundle).catch(() => {});
    const body = slim ? slimVodCatalogBody(bundle) : bundle;
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": xtreamCatalogCacheControlHeader(),
        "X-Vod-Catalog-Source": "upstream",
      },
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    if (aborted) {
      return NextResponse.json({ error: "Aborted" }, { status: 499 });
    }
    return NextResponse.json(
      { error: "Could not build the movie catalog from your IPTV server." },
      { status: 502 }
    );
  }
}
