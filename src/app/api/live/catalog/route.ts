import {
  liveCatalogDiskKey,
  readLiveCatalogDisk,
  writeLiveCatalogDisk,
} from "@/lib/xtream-catalog-disk-cache";
import { xtreamCatalogCacheControlHeader } from "@/lib/xtream-catalog-cache";
import { fetchLiveCatalogOnServer } from "@/lib/xtream-server-live-catalog";
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
 * Disk + in-memory upstream caches make repeat Live TV visits much faster.
 */
export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;

  const diskKey = liveCatalogDiskKey(creds);
  const slim = req.headers.get("x-live-catalog-slim") === "1";

  const diskHit = await readLiveCatalogDisk(diskKey);
  if (diskHit) {
    const body = slim ? slimCatalogBody(diskHit) : diskHit;
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": xtreamCatalogCacheControlHeader(),
        "X-Live-Catalog-Source": "disk",
      },
    });
  }

  try {
    const bundle = await fetchLiveCatalogOnServer(creds, {
      signal: req.signal,
    });
    void writeLiveCatalogDisk(diskKey, bundle).catch(() => {});
    const body = slim ? slimCatalogBody(bundle) : bundle;
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": xtreamCatalogCacheControlHeader(),
        "X-Live-Catalog-Source": "upstream",
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
