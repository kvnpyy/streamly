import type { LiveStream } from "@/lib/xtream-types";

type CacheEntry = {
  map: Map<number, LiveStream>;
  at: number;
};

const MAP_TTL_MS = 120_000;
const mapCache = new Map<string, CacheEntry>();

function cacheKey(streams: LiveStream[]): string {
  const n = streams.length;
  if (n === 0) return "0";
  return `${n}:${streams[0]!.stream_id}:${streams[n - 1]!.stream_id}`;
}

/** One pass over the catalog streams array per cache key — reused across shelf/channel API calls. */
export function streamByIdMapForCatalog(streams: LiveStream[]): Map<number, LiveStream> {
  const key = cacheKey(streams);
  const now = Date.now();
  const hit = mapCache.get(key);
  if (hit && now - hit.at < MAP_TTL_MS) return hit.map;

  const map = new Map<number, LiveStream>();
  for (const s of streams) map.set(s.stream_id, s);
  mapCache.set(key, { map, at: now });
  if (mapCache.size > 6) {
    const oldest = [...mapCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) mapCache.delete(oldest[0]);
  }
  return map;
}

export function materializeStreamIds(
  byId: Map<number, LiveStream>,
  ids: number[],
  limit: number
): LiveStream[] {
  if (!ids.length) return [];
  const out: LiveStream[] = [];
  for (let i = 0; i < ids.length && out.length < limit; i++) {
    const s = byId.get(ids[i]!);
    if (s) out.push(s);
  }
  return out;
}
