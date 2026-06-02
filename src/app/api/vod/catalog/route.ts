import {
  catalogDiskKey,
  readCatalogDisk,
  writeCatalogDisk,
} from "@/lib/xtream-catalog-disk-cache";
import { xtreamCatalogCacheControlHeader } from "@/lib/xtream-catalog-cache";
import { fetchVodCatalogOnServer } from "@/lib/xtream-server-vod-catalog";
import type { VodCatalogBundle } from "@/lib/vod-catalog-bundle";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCreds(req: NextRequest) {
  const server = req.headers.get("x-iptv-server");
  const username = req.headers.get("x-iptv-username");
  const password = req.headers.get("x-iptv-password");
  if (!server || !username || !password) return null;
  return { server: server.replace(/\/+$/, ""), username, password };
}

export async function GET(req: NextRequest) {
  const creds = readCreds(req);
  if (!creds) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const diskKey = catalogDiskKey("vod", creds);
  const diskHit = await readCatalogDisk<VodCatalogBundle>(diskKey);
  if (diskHit) {
    return NextResponse.json(diskHit, {
      headers: {
        "Cache-Control": xtreamCatalogCacheControlHeader(),
        "X-Vod-Catalog-Source": "disk",
      },
    });
  }

  try {
    const bundle = await fetchVodCatalogOnServer(creds, { signal: req.signal });
    void writeCatalogDisk(diskKey, bundle).catch(() => {});
    return NextResponse.json(bundle, {
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
