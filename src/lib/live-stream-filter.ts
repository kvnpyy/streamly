import { LIVE_LIST_MAX_CHANNELS } from "@/lib/live-guide-limits";
import { lookupStreamIdsForCategory } from "@/lib/live-stream-index";
import { looksAdult } from "@/lib/utils";
import type { LiveStream } from "@/lib/xtream-types";

/** Never scan more than this many catalog rows when resolving by category without an index. */
export const MAX_FALLBACK_CATALOG_SCAN = 16_000;

export function buildStreamByIdMap(
  streams: LiveStream[]
): Map<number, LiveStream> {
  const map = new Map<number, LiveStream>();
  for (const s of streams) map.set(s.stream_id, s);
  return map;
}

function streamPassesAdultFilter(
  stream: LiveStream,
  allowedCatIds: Set<string>,
  hideAdult: boolean,
  parentalUnlocked: boolean
): boolean {
  if (!hideAdult || parentalUnlocked) return true;
  return (
    allowedCatIds.has(String(stream.category_id)) &&
    !looksAdult({ name: stream.name, is_adult: stream.is_adult })
  );
}

function pushIfPasses(
  out: LiveStream[],
  stream: LiveStream,
  cap: number,
  allowedCatIds: Set<string>,
  hideAdult: boolean,
  parentalUnlocked: boolean
): boolean {
  if (out.length >= cap) return false;
  if (
    !streamPassesAdultFilter(
      stream,
      allowedCatIds,
      hideAdult,
      parentalUnlocked
    )
  ) {
    return out.length < cap;
  }
  out.push(stream);
  return out.length < cap;
}

/** Materialize up to `cap` streams from a category id list (index-first). */
function materializeFromIdList(
  ids: number[],
  cap: number,
  streamById: Map<number, LiveStream> | undefined,
  all: LiveStream[],
  allowedCatIds: Set<string>,
  hideAdult: boolean,
  parentalUnlocked: boolean
): LiveStream[] {
  const out: LiveStream[] = [];
  const missing = new Set<number>();

  for (let i = 0; i < ids.length && out.length < cap; i++) {
    const id = ids[i]!;
    const cached = streamById?.get(id);
    if (cached) {
      pushIfPasses(out, cached, cap, allowedCatIds, hideAdult, parentalUnlocked);
      continue;
    }
    missing.add(id);
  }

  if (missing.size === 0 || out.length >= cap || !all.length) {
    return out;
  }

  let scanned = 0;
  for (let i = 0; i < all.length && missing.size > 0 && out.length < cap; i++) {
    if (scanned++ >= MAX_FALLBACK_CATALOG_SCAN) break;
    const s = all[i]!;
    if (!missing.has(s.stream_id)) continue;
    missing.delete(s.stream_id);
    streamById?.set(s.stream_id, s);
    pushIfPasses(out, s, cap, allowedCatIds, hideAdult, parentalUnlocked);
  }

  return out;
}

/** O(min(category size, maxItems)) when `streamIdsByCategory` + `byId` are present. */
export function pickStreamsForCategory(
  all: LiveStream[],
  categoryId: string | "all",
  streamIdsByCategory?: Record<string, number[]>,
  byId?: Map<number, LiveStream>,
  maxItems: number = LIVE_LIST_MAX_CHANNELS
): LiveStream[] {
  return materializeLiveCategoryStreams({
    all,
    categoryId,
    streamIdsByCategory,
    streamById: byId,
    maxItems,
    allowedCatIds: new Set(),
    hideAdult: false,
    parentalUnlocked: true,
  });
}

export type MaterializeLiveCategoryStreamsOpts = {
  all: LiveStream[];
  categoryId: string | "all";
  streamIdsByCategory?: Record<string, number[]>;
  streamById?: Map<number, LiveStream>;
  maxItems: number;
  allowedCatIds: Set<string>;
  hideAdult: boolean;
  parentalUnlocked: boolean;
};

/**
 * Build at most `maxItems` channel rows — never materialize an entire provider catalog
 * when switching categories or opening the guide on "All".
 */
export function materializeLiveCategoryStreams({
  all,
  categoryId,
  streamIdsByCategory,
  streamById,
  maxItems,
  allowedCatIds,
  hideAdult,
  parentalUnlocked,
}: MaterializeLiveCategoryStreamsOpts): LiveStream[] {
  const cap = Math.max(0, maxItems);
  if (cap === 0) return [];

  if (categoryId === "all") {
    if (streamIdsByCategory) {
      const merged: number[] = [];
      for (const ids of Object.values(streamIdsByCategory)) {
        if (!ids?.length) continue;
        for (let i = 0; i < ids.length && merged.length < cap * 2; i++) {
          merged.push(ids[i]!);
        }
        if (merged.length >= cap * 2) break;
      }
      return materializeFromIdList(
        merged,
        cap,
        streamById,
        all,
        allowedCatIds,
        hideAdult,
        parentalUnlocked
      );
    }
    const out: LiveStream[] = [];
    for (
      let i = 0;
      i < all.length && out.length < cap && i < MAX_FALLBACK_CATALOG_SCAN;
      i++
    ) {
      const s = all[i]!;
      pushIfPasses(out, s, cap, allowedCatIds, hideAdult, parentalUnlocked);
    }
    return out;
  }

  const cid = String(categoryId);
  if (streamIdsByCategory) {
    const ids = lookupStreamIdsForCategory(streamIdsByCategory, cid);
    if (!ids?.length) return [];
    return materializeFromIdList(
      ids,
      cap,
      streamById,
      all,
      allowedCatIds,
      hideAdult,
      parentalUnlocked
    );
  }

  const out: LiveStream[] = [];
  for (
    let i = 0;
    i < all.length && out.length < cap && i < MAX_FALLBACK_CATALOG_SCAN;
    i++
  ) {
    const s = all[i]!;
    if (String(s.category_id) !== cid) continue;
    pushIfPasses(out, s, cap, allowedCatIds, hideAdult, parentalUnlocked);
  }
  return out;
}

export function filterAdultLiveStreams(
  list: LiveStream[],
  allowedCatIds: Set<string>,
  hideAdult: boolean,
  parentalUnlocked: boolean
): LiveStream[] {
  if (!hideAdult || parentalUnlocked) return list;
  return list.filter((s) =>
    streamPassesAdultFilter(s, allowedCatIds, hideAdult, parentalUnlocked)
  );
}
