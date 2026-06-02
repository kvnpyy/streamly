import type { LiveStream } from "@/lib/xtream-types";

/** Pass to shelf browse when channel rows are loaded per category / shelf API (avoids O(n) copies). */
export const EMPTY_LIVE_STREAMS: LiveStream[] = [];

/** Server provides per-category counts — shelf previews load via `/api/live/catalog/shelves`. */
export function hasLiveServerCategoryCounts(
  countByCategoryId: Record<string, number> | undefined
): boolean {
  return (
    countByCategoryId !== undefined &&
    Object.keys(countByCategoryId).length > 0
  );
}
