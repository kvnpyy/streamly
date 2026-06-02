"use client";

import {
  buildLiveShelfMeta,
  buildLiveShelfMetaFromIndex,
  type LiveShelfMeta,
} from "@/lib/live-category-shelf";
import {
  MAX_SLICES_PER_LOAD_REQUEST,
  resolveVisibleAfterBuild,
  shouldChainBootstrapBuild,
  shouldChainClickBuild,
} from "@/lib/live-shelf-load-more";
import type { TvRegion } from "@/lib/geo-continent";
import { buildStreamByIdMap } from "@/lib/live-stream-filter";
import {
  buildStreamIdsByCategory,
  lookupStreamIdsForCategory,
} from "@/lib/live-stream-index";
import type { ShelfPreviewPayload } from "@/lib/live-catalog-shelves";
import type { Category, LiveStream } from "@/lib/xtream-types";
import { buildShelfCategoryListChunked } from "@/lib/live-shelf-category-list";
import { yieldToMain } from "@/lib/yield-to-main";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** Idle prefetch buffer (0 = only build on user click + bootstrap). */
export const SHELF_PREFETCH_AHEAD = 0;
/** Max IPTV category rows scanned per background slice (never scan the whole catalog in one turn). */
export const CATEGORIES_PER_BUILD_SLICE = 4;
/** Initial paint: chained idle slices until we have this many shelves or hit scan cap. */
const MAX_BOOTSTRAP_CATEGORY_SCAN = 12;
/** Cap mounted shelf rows so "Show more" cannot grow the DOM without bound. */
export const MAX_VISIBLE_SHELVES = 10;
/** Bootstrap target buffer — 0 disables idle prefetch between clicks. */
const SHELF_BUFFER_AHEAD = 0;

export type UseLiveCategoryShelvesOptions = {
  categories: Category[];
  streams: LiveStream[];
  region: TvRegion;
  maxPerShelf: number;
  initialVisible: number;
  loadIncrement: number;
  streamIdsByCategory?: Record<string, number[]>;
  /** Per-category counts from slim catalog — used when id arrays stay on the server. */
  countByCategoryId?: Record<string, number>;
  /** Pre-built map from the live catalog — avoids scanning `streams` on every render. */
  streamById?: Map<number, LiveStream>;
  searchHitsByCategory?: Map<string, LiveStream[]> | null;
  shelfInputsKey: string;
  categoriesPerSlice?: number;
  /** When false, aborts in-flight builds (e.g. user left shelf browse). */
  enabled?: boolean;
  /** Batch shelf previews (slim catalog path). */
  resolveShelfPreviews?: (
    categoryIds: string[],
    limitPerShelf: number
  ) => Promise<Record<string, ShelfPreviewPayload>>;
  /** Legacy: resolve preview rows by id when the client still has a stream index. */
  resolveStreamsByIds?: (ids: number[]) => Promise<LiveStream[]>;
};

export function useLiveCategoryShelves({
  categories,
  streams,
  region,
  maxPerShelf,
  initialVisible,
  loadIncrement,
  streamIdsByCategory,
  countByCategoryId,
  streamById: streamByIdProp,
  searchHitsByCategory,
  shelfInputsKey,
  categoriesPerSlice = CATEGORIES_PER_BUILD_SLICE,
  enabled = true,
  resolveShelfPreviews,
  resolveStreamsByIds,
}: UseLiveCategoryShelvesOptions) {
  const deferredStreams = useDeferredValue(streams);
  const deferredCats = useDeferredValue(categories);
  const useServerIndex = Boolean(streamIdsByCategory);
  const useServerCountsOnly =
    !useServerIndex && Boolean(countByCategoryId) && Boolean(resolveShelfPreviews);

  const streamIndexKey = useMemo(() => {
    if (searchHitsByCategory) return "search";
    if (useServerIndex) return "server-index";
    const n = deferredStreams.length;
    if (n === 0) return "empty";
    return `local:${n}:${deferredStreams[0]?.stream_id ?? 0}:${deferredStreams[n - 1]?.stream_id ?? 0}`;
  }, [deferredStreams, useServerIndex, searchHitsByCategory]);

  const streamById = useMemo(() => {
    if (streamByIdProp) return streamByIdProp;
    return buildStreamByIdMap(deferredStreams);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by streamIndexKey
  }, [streamByIdProp, streamIndexKey]);

  const idsByCategory = useMemo(() => {
    if (searchHitsByCategory) return null;
    if (useServerIndex && streamIdsByCategory) return streamIdsByCategory;
    return buildStreamIdsByCategory(deferredStreams);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by streamIndexKey
  }, [streamIndexKey, streamIdsByCategory, searchHitsByCategory, useServerIndex]);

  const shelfCategoryListFromSearch = useMemo(() => {
    if (!searchHitsByCategory) return null;
    return deferredCats.filter((c) =>
      searchHitsByCategory.has(String(c.category_id))
    );
  }, [deferredCats, searchHitsByCategory]);

  const [chunkedShelfCategoryList, setChunkedShelfCategoryList] = useState<
    Category[] | null
  >(null);
  const shelfCategoryListGenRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (shelfCategoryListFromSearch) return;
    if (!idsByCategory && !countByCategoryId) {
      queueMicrotask(() => setChunkedShelfCategoryList(deferredCats));
      return;
    }
    const gen = ++shelfCategoryListGenRef.current;
    queueMicrotask(() => setChunkedShelfCategoryList([]));
    void buildShelfCategoryListChunked({
      categories: deferredCats,
      idsByCategory: idsByCategory ?? undefined,
      countByCategoryId: countByCategoryId ?? undefined,
      region,
      isStale: () => shelfCategoryListGenRef.current !== gen,
    }).then((list) => {
      if (shelfCategoryListGenRef.current === gen) {
        queueMicrotask(() => setChunkedShelfCategoryList(list));
      }
    });
  }, [
    enabled,
    shelfInputsKey,
    deferredCats,
    idsByCategory,
    countByCategoryId,
    region,
    shelfCategoryListFromSearch,
  ]);

  const shelfCategoryList = useMemo(
    () => shelfCategoryListFromSearch ?? chunkedShelfCategoryList ?? [],
    [shelfCategoryListFromSearch, chunkedShelfCategoryList]
  );

  const shelfCategoryListRef = useRef(shelfCategoryList);
  const buildOneShelfRef = useRef<(category: Category) => LiveShelfMeta | null>(
    () => null
  );
  const resolveShelfPreviewsRef = useRef(resolveShelfPreviews);
  const resolveStreamsRef = useRef(resolveStreamsByIds);
  const idsByCategoryRef = useRef(idsByCategory);
  const useServerCountsOnlyRef = useRef(useServerCountsOnly);
  const maxPerShelfRef = useRef(maxPerShelf);
  const regionRef = useRef(region);

  useEffect(() => {
    resolveShelfPreviewsRef.current = resolveShelfPreviews;
    resolveStreamsRef.current = resolveStreamsByIds;
    idsByCategoryRef.current = idsByCategory;
    useServerCountsOnlyRef.current = useServerCountsOnly;
    maxPerShelfRef.current = maxPerShelf;
    regionRef.current = region;
  }, [
    resolveShelfPreviews,
    resolveStreamsByIds,
    idsByCategory,
    useServerCountsOnly,
    maxPerShelf,
    region,
  ]);

  const buildOneShelf = useCallback(
    (category: Category): LiveShelfMeta | null => {
      const catId = String(category.category_id);
      const previewLimit = maxPerShelf + 1;

      if (searchHitsByCategory) {
        return buildLiveShelfMeta(
          category,
          searchHitsByCategory.get(catId),
          region,
          previewLimit
        );
      }

      if (idsByCategory) {
        return buildLiveShelfMetaFromIndex(
          category,
          idsByCategory[catId],
          streamById,
          region,
          previewLimit
        );
      }

      return null;
    },
    [searchHitsByCategory, idsByCategory, streamById, region, maxPerShelf]
  );

  useEffect(() => {
    shelfCategoryListRef.current = shelfCategoryList;
    buildOneShelfRef.current = buildOneShelf;
  }, [shelfCategoryList, buildOneShelf]);

  const [visibleShelfCount, setVisibleShelfCount] = useState(initialVisible);
  const [allShelves, setAllShelves] = useState<LiveShelfMeta[]>([]);
  const [shelvesBuilding, setShelvesBuilding] = useState(false);
  const [moreCategoriesPending, setMoreCategoriesPending] = useState(false);
  const [buildGeneration, setBuildGeneration] = useState(0);
  const [awaitingClickBuild, setAwaitingClickBuild] = useState(false);

  const shelfBuildKeyRef = useRef("");
  const shelfCatCursorRef = useRef(0);
  const allShelvesRef = useRef<LiveShelfMeta[]>([]);
  const visibleShelfCountRef = useRef(initialVisible);
  const moreCategoriesPendingRef = useRef(false);
  const bootstrapActiveRef = useRef(false);
  const bootstrapScannedRef = useRef(0);
  const buildInFlightRef = useRef(false);
  const pendingBuildRef = useRef(false);
  const loadTargetVisibleRef = useRef(0);
  const clickLoadActiveRef = useRef(false);
  const clickSlicesDoneRef = useRef(0);
  /** Bumped on catalog reset so in-flight slice work cannot append stale shelves. */
  const buildSessionRef = useRef(0);
  const needsBootstrapKickRef = useRef(false);

  useEffect(() => {
    if (enabled) return;
    buildSessionRef.current += 1;
    needsBootstrapKickRef.current = false;
    clickLoadActiveRef.current = false;
    buildInFlightRef.current = false;
    pendingBuildRef.current = false;
    queueMicrotask(() => {
      setAwaitingClickBuild(false);
      setShelvesBuilding(false);
    });
  }, [enabled]);

  useEffect(() => {
    visibleShelfCountRef.current = visibleShelfCount;
  }, [visibleShelfCount]);

  useEffect(() => {
    allShelvesRef.current = allShelves;
  }, [allShelves]);

  useEffect(() => {
    moreCategoriesPendingRef.current = moreCategoriesPending;
  }, [moreCategoriesPending]);

  const finishClickLoad = useCallback(() => {
    const target = loadTargetVisibleRef.current;
    if (target > 0) {
      const nextVisible = resolveVisibleAfterBuild({
        targetVisible: target,
        builtCount: allShelvesRef.current.length,
      });
      startTransition(() => {
        setVisibleShelfCount(nextVisible);
        visibleShelfCountRef.current = nextVisible;
      });
    }
    loadTargetVisibleRef.current = 0;
    clickLoadActiveRef.current = false;
    clickSlicesDoneRef.current = 0;
    setAwaitingClickBuild(false);
  }, []);

  const finishClickLoadRef = useRef(finishClickLoad);
  useEffect(() => {
    finishClickLoadRef.current = finishClickLoad;
  }, [finishClickLoad]);

  const scheduleBuildSlice = useCallback(() => {
    if (shelfCatCursorRef.current >= shelfCategoryListRef.current.length) {
      moreCategoriesPendingRef.current = false;
      setMoreCategoriesPending(false);
      if (clickLoadActiveRef.current) {
        finishClickLoadRef.current();
      }
      return;
    }
    if (buildInFlightRef.current) {
      pendingBuildRef.current = true;
      return;
    }
    setShelvesBuilding(true);
    setBuildGeneration((g) => g + 1);
  }, []);

  const queueBuildSlice = useCallback(() => {
    if (!enabled) return;
    scheduleBuildSlice();
  }, [enabled, scheduleBuildSlice]);

  const resetVisible = useCallback(() => {
    if (!enabled) return;
    loadTargetVisibleRef.current = 0;
    clickLoadActiveRef.current = false;
    clickSlicesDoneRef.current = 0;
    setAwaitingClickBuild(false);
    setVisibleShelfCount(initialVisible);
    visibleShelfCountRef.current = initialVisible;
    shelfCatCursorRef.current = 0;
    bootstrapScannedRef.current = 0;
    bootstrapActiveRef.current = true;
    buildSessionRef.current += 1;
    allShelvesRef.current = [];
    setAllShelves([]);
    setMoreCategoriesPending(true);
    needsBootstrapKickRef.current = true;
    if (shelfCategoryList.length > 0) {
      needsBootstrapKickRef.current = false;
      queueBuildSlice();
    }
  }, [enabled, initialVisible, shelfCategoryList.length, queueBuildSlice]);

  useEffect(() => {
    if (!enabled) return;
    const reset = shelfBuildKeyRef.current !== shelfInputsKey;
    if (!reset) return;
    shelfBuildKeyRef.current = shelfInputsKey;
    loadTargetVisibleRef.current = 0;
    clickLoadActiveRef.current = false;
    clickSlicesDoneRef.current = 0;
    setAwaitingClickBuild(false);
    shelfCatCursorRef.current = 0;
    bootstrapScannedRef.current = 0;
    bootstrapActiveRef.current = true;
    buildSessionRef.current += 1;
    needsBootstrapKickRef.current = true;
    allShelvesRef.current = [];
    visibleShelfCountRef.current = initialVisible;
    setVisibleShelfCount(initialVisible);
    setAllShelves([]);
    setMoreCategoriesPending(true);
  }, [enabled, shelfInputsKey, initialVisible]);

  /** Start bootstrap once the async category filter finishes. */
  useEffect(() => {
    if (!enabled) return;
    if (!needsBootstrapKickRef.current) return;
    if (shelfCategoryList.length === 0) return;
    needsBootstrapKickRef.current = false;
    queueMicrotask(() => {
      setMoreCategoriesPending(shelfCategoryList.length > 0);
      queueBuildSlice();
    });
  }, [shelfCategoryList, queueBuildSlice]);

  /** One bounded slice per buildGeneration — never walk the full category list in one task. */
  useEffect(() => {
    if (!enabled || buildGeneration === 0) return;

    let cancelled = false;
    let continuedBuild = false;
    const session = buildSessionRef.current;
    buildInFlightRef.current = true;

    void (async () => {
      const stale = () => cancelled || session !== buildSessionRef.current;
      const sessionStale = () => session !== buildSessionRef.current;

      try {
        const list = shelfCategoryListRef.current;
        let catIndex = shelfCatCursorRef.current;
        const append: LiveShelfMeta[] = [];
        let scanned = 0;
        const sliceLimit = categoriesPerSlice;
        const categoriesInSlice: Category[] = [];

        for (; catIndex < list.length && scanned < sliceLimit; catIndex++) {
          if (stale()) return;
          scanned++;
          bootstrapScannedRef.current += 1;
          categoriesInSlice.push(list[catIndex]!);
        }

        if (stale()) return;

        const previewLimit = maxPerShelfRef.current + 1;

        if (useServerCountsOnlyRef.current && resolveShelfPreviewsRef.current) {
          const catIds = categoriesInSlice.map((c) => String(c.category_id));
          try {
            const batch = await resolveShelfPreviewsRef.current(
              catIds,
              previewLimit
            );
            if (stale()) return;
            for (const category of categoriesInSlice) {
              const catId = String(category.category_id);
              const payload = batch[catId];
              if (!payload?.streams?.length) continue;
              const shelf = buildLiveShelfMeta(
                category,
                payload.streams,
                regionRef.current,
                previewLimit
              );
              if (shelf) {
                append.push({ ...shelf, total: payload.total });
              }
            }
          } catch {
            /* network — skip slice */
          }
          await yieldToMain();
          if (stale()) return;
        } else {
          for (const category of categoriesInSlice) {
            if (stale()) return;
            let shelf = buildOneShelfRef.current(category);
            if ((!shelf || shelf.preview.length === 0) && resolveStreamsRef.current) {
              const catId = String(category.category_id);
              const index = idsByCategoryRef.current;
              const ids = index
                ? lookupStreamIdsForCategory(index, catId)
                : undefined;
              if (ids?.length) {
                const fetchCount = Math.min(ids.length, previewLimit * 4);
                try {
                  const rows = await resolveStreamsRef.current(
                    ids.slice(0, fetchCount)
                  );
                  const byId = new Map(rows.map((s) => [s.stream_id, s]));
                  shelf = buildLiveShelfMetaFromIndex(
                    category,
                    ids,
                    byId,
                    regionRef.current,
                    previewLimit
                  );
                } catch {
                  shelf = null;
                }
              }
            }
            if (shelf && shelf.preview.length > 0) append.push(shelf);
          }
          await yieldToMain();
          if (stale()) return;
        }

        if (stale()) return;

        shelfCatCursorRef.current = catIndex;
        const hasMoreCats = catIndex < list.length;
        moreCategoriesPendingRef.current = hasMoreCats;
        setMoreCategoriesPending(hasMoreCats);

        if (append.length > 0) {
          setAllShelves((prev) => {
            const next = [...prev, ...append];
            allShelvesRef.current = next;
            return next;
          });
        }

        if (stale()) return;

        const bootstrapping = bootstrapActiveRef.current;
        const built = allShelvesRef.current.length;
        const clickActive = clickLoadActiveRef.current;
        const targetVisible = loadTargetVisibleRef.current;

        if (
          shouldChainClickBuild({
            clickActive,
            builtCount: built,
            targetVisible,
            hasMoreCategories: hasMoreCats,
            slicesDone: clickSlicesDoneRef.current,
            maxSlices: MAX_SLICES_PER_LOAD_REQUEST,
          })
        ) {
          clickSlicesDoneRef.current += 1;
          await yieldToMain();
          if (!stale()) {
            continuedBuild = true;
            scheduleBuildSlice();
          }
          return;
        }

        if (clickActive) {
          finishClickLoadRef.current();
        }

        if (
          shouldChainBootstrapBuild({
            bootstrapping,
            builtCount: built,
            initialVisible,
            bufferAhead: SHELF_BUFFER_AHEAD,
            categoriesScanned: bootstrapScannedRef.current,
            maxCategoryScan: MAX_BOOTSTRAP_CATEGORY_SCAN,
            hasMoreCategories: hasMoreCats,
            userClickInProgress: clickActive,
          })
        ) {
          await yieldToMain();
          if (!stale()) {
            continuedBuild = true;
            scheduleBuildSlice();
          }
          return;
        }

        if (bootstrapping) {
          bootstrapActiveRef.current = false;
        }
      } finally {
        buildInFlightRef.current = false;
        if (sessionStale() && clickLoadActiveRef.current) {
          finishClickLoadRef.current();
          setShelvesBuilding(false);
          return;
        }
        if (
          !stale() &&
          pendingBuildRef.current &&
          shelfCatCursorRef.current < shelfCategoryListRef.current.length
        ) {
          pendingBuildRef.current = false;
          continuedBuild = true;
          scheduleBuildSlice();
        } else if (!continuedBuild) {
          setShelvesBuilding(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    buildGeneration,
    categoriesPerSlice,
    initialVisible,
    scheduleBuildSlice,
  ]);

  const loadMoreShelves = useCallback(() => {
    if (!enabled) return;
    if (
      clickLoadActiveRef.current ||
      awaitingClickBuild ||
      buildInFlightRef.current
    ) {
      return;
    }

    const built = allShelvesRef.current.length;
    const visible = visibleShelfCountRef.current;
    const ready = built - visible;

    if (ready > 0) {
      const nextVisible = Math.min(
        visible + loadIncrement,
        built,
        MAX_VISIBLE_SHELVES
      );
      requestAnimationFrame(() => {
        startTransition(() => {
          setVisibleShelfCount(nextVisible);
          visibleShelfCountRef.current = nextVisible;
        });
      });
      if (
        nextVisible + loadIncrement > built &&
        moreCategoriesPendingRef.current
      ) {
        queueBuildSlice();
      }
      return;
    }

    if (!moreCategoriesPendingRef.current) return;
    if (visible >= MAX_VISIBLE_SHELVES) return;

    clickLoadActiveRef.current = true;
    clickSlicesDoneRef.current = 0;
    setAwaitingClickBuild(true);
    loadTargetVisibleRef.current = Math.min(
      visible + loadIncrement,
      MAX_VISIBLE_SHELVES
    );
    queueBuildSlice();
  }, [enabled, loadIncrement, queueBuildSlice, awaitingClickBuild]);

  const renderedShelves = allShelves.slice(0, visibleShelfCount);
  const shelvesReadyToReveal = Math.max(0, allShelves.length - visibleShelfCount);
  const hasMore =
    (visibleShelfCount < allShelves.length || moreCategoriesPending) &&
    visibleShelfCount < MAX_VISIBLE_SHELVES;

  return {
    allShelves,
    renderedShelves,
    visibleShelfCount,
    hasMore,
    shelvesBuilding,
    moreCategoriesPending,
    shelvesReadyToReveal,
    loadingMoreCategories: awaitingClickBuild && shelvesBuilding,
    loadMoreShelves,
    resetVisible,
    streamById,
    idsByCategory,
  };
}
