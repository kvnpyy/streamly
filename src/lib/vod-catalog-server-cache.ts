import {
  seriesItemByIdMap,
  vodStreamByIdMap,
} from "@/lib/vod-catalog-stream-map";
import {
  catalogDiskKey,
  readCatalogDisk,
  writeCatalogDisk,
} from "@/lib/xtream-catalog-disk-cache";
import { fetchSeriesCatalogOnServer } from "@/lib/xtream-server-series-catalog";
import { fetchVodCatalogOnServer } from "@/lib/xtream-server-vod-catalog";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";
import type { SeriesCatalogBundle, VodCatalogBundle } from "@/lib/vod-catalog-bundle";
import { buildIdsByCategory } from "@/lib/vod-catalog-index";
import { parsePositiveRouteId } from "@/lib/utils";

type VodCacheEntry = {
  bundle: VodCatalogBundle;
  index: Record<string, number[]>;
  streamById: Map<number, VodStream>;
  at: number;
};

type SeriesCacheEntry = {
  bundle: SeriesCatalogBundle;
  index: Record<string, number[]>;
  seriesById: Map<number, SeriesItem>;
  at: number;
};

const TTL_MS = 180_000;
const vodCache = new Map<string, VodCacheEntry>();
const seriesCache = new Map<string, SeriesCacheEntry>();

function normalizeVodBundle(bundle: VodCatalogBundle): VodCacheEntry {
  const index =
    bundle.idsByCategory && Object.keys(bundle.idsByCategory).length > 0
      ? bundle.idsByCategory
      : buildIdsByCategory(
          bundle.streams ?? [],
          (s) => String(s.category_id),
          (s) => s.stream_id
        );
  return {
    bundle: { ...bundle, idsByCategory: index },
    index,
    streamById: vodStreamByIdMap(bundle.streams ?? []),
    at: Date.now(),
  };
}

function normalizeSeriesBundle(bundle: SeriesCatalogBundle): SeriesCacheEntry {
  const index =
    bundle.idsByCategory && Object.keys(bundle.idsByCategory).length > 0
      ? bundle.idsByCategory
      : buildIdsByCategory(
          bundle.streams ?? [],
          (s) => String(s.category_id),
          (s) => parsePositiveRouteId(s.series_id)!
        );
  return {
    bundle: { ...bundle, idsByCategory: index },
    index,
    seriesById: seriesItemByIdMap(bundle.streams ?? []),
    at: Date.now(),
  };
}

function trimMap<T>(map: Map<string, T>): void {
  if (map.size <= 4) return;
  const oldest = [...map.entries()].sort(
    (a, b) =>
      (a[1] as { at: number }).at - (b[1] as { at: number }).at
  )[0];
  if (oldest) map.delete(oldest[0]);
}

export async function getCachedVodCatalogEntry(creds: {
  server: string;
  username: string;
  password: string;
}): Promise<VodCacheEntry> {
  const key = catalogDiskKey("vod", creds);
  const now = Date.now();
  const hit = vodCache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit;

  const diskHit = await readCatalogDisk<VodCatalogBundle>(key);
  if (diskHit) {
    const entry = normalizeVodBundle(diskHit);
    vodCache.set(key, entry);
    return entry;
  }

  const bundle = await fetchVodCatalogOnServer(creds);
  void writeCatalogDisk(key, bundle).catch(() => {});
  const entry = normalizeVodBundle(bundle);
  vodCache.set(key, entry);
  trimMap(vodCache);
  return entry;
}

export async function getCachedSeriesCatalogEntry(creds: {
  server: string;
  username: string;
  password: string;
}): Promise<SeriesCacheEntry> {
  const key = catalogDiskKey("series", creds);
  const now = Date.now();
  const hit = seriesCache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit;

  const diskHit = await readCatalogDisk<SeriesCatalogBundle>(key);
  if (diskHit) {
    const entry = normalizeSeriesBundle(diskHit);
    seriesCache.set(key, entry);
    return entry;
  }

  const bundle = await fetchSeriesCatalogOnServer(creds);
  void writeCatalogDisk(key, bundle).catch(() => {});
  const entry = normalizeSeriesBundle(bundle);
  seriesCache.set(key, entry);
  trimMap(seriesCache);
  return entry;
}
