import type { LiveStream } from "@/lib/xtream-types";

/** Resolve category stream ids when API keys differ (string vs numeric). */
export function lookupStreamIdsForCategory(
  streamIdsByCategory: Record<string, number[]>,
  categoryId: string
): number[] | undefined {
  const key = String(categoryId);
  const direct = streamIdsByCategory[key];
  if (direct?.length) return direct;
  const trimmed = key.trim();
  if (trimmed !== key) {
    const t = streamIdsByCategory[trimmed];
    if (t?.length) return t;
  }
  const n = Number(key);
  if (Number.isFinite(n)) {
    const numKey = streamIdsByCategory[String(n)];
    if (numKey?.length) return numKey;
  }
  return undefined;
}

/** Server-built index: category_id → stream_id[] (fast shelf grouping on the client). */
export function buildStreamIdsByCategory(
  streams: LiveStream[]
): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const s of streams) {
    const cid = String(s.category_id);
    const bucket = map[cid];
    if (bucket) bucket.push(s.stream_id);
    else map[cid] = [s.stream_id];
  }
  return map;
}

export function streamsByCategoryFromIndex(
  streams: LiveStream[],
  streamIdsByCategory: Record<string, number[]>
): Map<string, LiveStream[]> {
  const byId = new Map<number, LiveStream>();
  for (const s of streams) byId.set(s.stream_id, s);

  const map = new Map<string, LiveStream[]>();
  for (const [catId, ids] of Object.entries(streamIdsByCategory)) {
    const list: LiveStream[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (row) list.push(row);
    }
    if (list.length > 0) map.set(catId, list);
  }
  return map;
}
