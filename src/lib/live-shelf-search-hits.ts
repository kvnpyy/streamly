import type { LiveStream } from "@/lib/xtream-types";

const DEFAULT_MAX_HITS_PER_CATEGORY = 12;
/** Never walk an entire 5k+ channel category when searching shelves. */
const MAX_IDS_SCANNED_PER_CATEGORY = 160;

export type BuildLiveSearchHitsOptions = {
  queryLower: string;
  streamIdsByCategory: Record<string, number[]> | null;
  streamById: Map<number, LiveStream>;
  /** Fallback when no server index — single O(n) pass over streams. */
  streams: LiveStream[];
  nameLowerById: Map<number, string>;
  nowPlayingMap: Map<number, string>;
  programTitleByStreamId?: Map<number, string>;
  maxHitsPerCategory?: number;
  /** With server index — scan only these ids (not every key in the index). */
  categoryIds?: readonly string[];
};

function channelNameMatches(
  ch: LiveStream,
  qLower: string,
  nameLowerById: Map<number, string>
): boolean {
  const lower =
    nameLowerById.get(ch.stream_id) ?? ch.name.toLowerCase();
  return lower.includes(qLower);
}

function channelMatchesSearch(
  ch: LiveStream,
  qLower: string,
  nameLowerById: Map<number, string>,
  nowPlayingMap: Map<number, string>,
  programTitleByStreamId?: Map<number, string>
): boolean {
  if (channelNameMatches(ch, qLower, nameLowerById)) return true;
  const np =
    nowPlayingMap.get(ch.stream_id) ?? programTitleByStreamId?.get(ch.stream_id);
  return np ? np.toLowerCase().includes(qLower) : false;
}

/**
 * Group search matches by category without scanning every category × every channel.
 * Uses server index keys when present; otherwise one pass over `streams`.
 */
export function buildLiveSearchHitsByCategory({
  queryLower,
  streamIdsByCategory,
  streamById,
  streams,
  nameLowerById,
  nowPlayingMap,
  programTitleByStreamId,
  maxHitsPerCategory = DEFAULT_MAX_HITS_PER_CATEGORY,
  categoryIds,
}: BuildLiveSearchHitsOptions): Map<string, LiveStream[]> {
  const map = new Map<string, LiveStream[]>();
  if (!queryLower) return map;

  if (streamIdsByCategory && categoryIds?.length) {
    const catIds = categoryIds;
    for (const catId of catIds) {
      const ids = streamIdsByCategory[catId];
      if (!ids?.length) continue;
      let hits: LiveStream[] | undefined;
      const scanCap = Math.min(ids.length, MAX_IDS_SCANNED_PER_CATEGORY);
      for (let i = 0; i < scanCap; i++) {
        const id = ids[i]!;
        const s = streamById.get(id);
        if (
          s &&
          channelMatchesSearch(
            s,
            queryLower,
            nameLowerById,
            nowPlayingMap,
            programTitleByStreamId
          )
        ) {
          if (!hits) hits = [];
          hits.push(s);
          if (hits.length >= maxHitsPerCategory) break;
        }
      }
      if (hits?.length) map.set(catId, hits);
    }
    return map;
  }


  for (const s of streams) {
    if (!channelMatchesSearch(s, queryLower, nameLowerById, nowPlayingMap, programTitleByStreamId)) {
      continue;
    }
    const catId = String(s.category_id);
    let hits = map.get(catId);
    if (!hits) {
      hits = [];
      map.set(catId, hits);
    }
    if (hits.length < maxHitsPerCategory) hits.push(s);
  }

  return map;
}
