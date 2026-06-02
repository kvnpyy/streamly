import { streamByIdMapForCatalog } from "@/lib/live-catalog-stream-map";
import { buildStreamIdsByCategory } from "@/lib/live-stream-index";
import type { LiveCatalogBundle } from "@/lib/xtream";
import {
  liveCatalogDiskKey,
  readLiveCatalogDisk,
  writeLiveCatalogDisk,
} from "@/lib/xtream-catalog-disk-cache";
import { fetchLiveCatalogOnServer } from "@/lib/xtream-server-live-catalog";
import type { LiveStream } from "@/lib/xtream-types";

type CacheEntry = {
  bundle: LiveCatalogBundle;
  index: Record<string, number[]>;
  streamById: Map<number, LiveStream>;
  at: number;
};

const TTL_MS = 180_000;
const cache = new Map<string, CacheEntry>();

function normalizeBundle(bundle: LiveCatalogBundle): CacheEntry {
  const index =
    bundle.streamIdsByCategory &&
    Object.keys(bundle.streamIdsByCategory).length > 0
      ? bundle.streamIdsByCategory
      : buildStreamIdsByCategory(bundle.streams);
  return {
    bundle,
    index,
    streamById: streamByIdMapForCatalog(bundle.streams),
    at: Date.now(),
  };
}

/**
 * In-memory live catalog for API routes — avoids re-reading and re-parsing the
 * full on-disk JSON on every shelf / channel request.
 */
export async function getCachedLiveCatalogEntry(creds: {
  server: string;
  username: string;
  password: string;
}): Promise<CacheEntry> {
  const key = liveCatalogDiskKey(creds);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit;

  const diskHit = await readLiveCatalogDisk(key);
  if (diskHit) {
    const bundle: LiveCatalogBundle = {
      categories: diskHit.categories,
      streams: diskHit.streams,
      countByCategoryId: diskHit.countByCategoryId,
      streamIdsByCategory:
        diskHit.streamIdsByCategory ?? buildStreamIdsByCategory(diskHit.streams),
    };
    const entry = normalizeBundle(bundle);
    cache.set(key, entry);
    return entry;
  }

  const bundle = await fetchLiveCatalogOnServer(creds);
  void writeLiveCatalogDisk(key, bundle).catch(() => {});
  const entry = normalizeBundle(bundle);
  cache.set(key, entry);
  if (cache.size > 4) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return entry;
}
