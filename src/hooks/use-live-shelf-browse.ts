"use client";

import type { LiveShelfMeta } from "@/lib/live-category-shelf";
import type { TvRegion } from "@/lib/geo-continent";
import {
  fetchLiveShelfBatch,
  shelfBatchToMeta,
} from "@/lib/live-catalog-shelf-batch";
import type { XtreamCredentials } from "@/lib/xtream-types";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/** Server allows up to 24 categories per shelf-batch request. */
const SHELVES_PER_FETCH = 24;
const INITIAL_SHELF_COUNT = 8;

export type UseLiveShelfBrowseOptions = {
  creds: XtreamCredentials;
  region: TvRegion;
  maxPerShelf: number;
  initialVisible: number;
  loadIncrement: number;
  enabled?: boolean;
};

/**
 * Shelf browse: one HTTP round-trip per batch via `/api/live/catalog/shelf-batch`.
 * Prefetches the next batch so "Show more" can reveal without waiting.
 */
export function useLiveShelfBrowse({
  creds,
  region,
  maxPerShelf,
  initialVisible,
  loadIncrement,
  enabled = true,
}: UseLiveShelfBrowseOptions) {
  const previewLimit = maxPerShelf + 1;

  const [allShelves, setAllShelves] = useState<LiveShelfMeta[]>([]);
  const [visibleShelfCount, setVisibleShelfCount] = useState(initialVisible);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [hasMoreCategories, setHasMoreCategories] = useState(true);
  const [totalCategoriesInRegion, setTotalCategoriesInRegion] = useState<
    number | null
  >(null);

  const allShelvesRef = useRef<LiveShelfMeta[]>([]);
  const visibleRef = useRef(initialVisible);
  const categoryOffsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const busyRef = useRef(false);
  const sessionRef = useRef(0);
  const regionRef = useRef(region);
  const prefetchedRef = useRef<LiveShelfMeta[] | null>(null);
  const prefetchingRef = useRef(false);

  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  useEffect(() => {
    allShelvesRef.current = allShelves;
  }, [allShelves]);

  useEffect(() => {
    visibleRef.current = visibleShelfCount;
  }, [visibleShelfCount]);

  const fetchBatch = useCallback(
    async (offset: number, count: number, signal?: AbortSignal) => {
      const res = await fetchLiveShelfBatch(creds, {
        region: regionRef.current,
        offset,
        count,
        limitPerShelf: previewLimit,
        signal,
      });
      categoryOffsetRef.current = res.nextOffset;
      hasMoreRef.current = res.hasMore;
      setHasMoreCategories(res.hasMore);
      if (typeof res.totalCategories === "number") {
        setTotalCategoriesInRegion(res.totalCategories);
      }
      return shelfBatchToMeta(res.shelves);
    },
    [creds, previewLimit]
  );

  const prefetchNext = useCallback(() => {
    if (!enabled || !hasMoreRef.current || prefetchingRef.current) return;
    if (prefetchedRef.current?.length) return;
    prefetchingRef.current = true;
    const session = sessionRef.current;
    void fetchBatch(categoryOffsetRef.current, SHELVES_PER_FETCH)
      .then((shelves) => {
        if (session === sessionRef.current && shelves.length) {
          prefetchedRef.current = shelves;
        }
      })
      .catch(() => {})
      .finally(() => {
        prefetchingRef.current = false;
      });
  }, [enabled, fetchBatch]);

  const appendShelves = useCallback((append: LiveShelfMeta[]) => {
    if (!append.length) return;
    const next = [...allShelvesRef.current, ...append];
    allShelvesRef.current = next;
    // Urgent update: a low-priority transition can be starved and never
    // commit until a later urgent update forces a flush (left the page blank).
    setAllShelves(next);
    prefetchedRef.current = null;
    prefetchNext();
  }, [prefetchNext]);

  useEffect(() => {
    if (!enabled) return;
    sessionRef.current += 1;
    categoryOffsetRef.current = 0;
    hasMoreRef.current = true;
    prefetchedRef.current = null;
    allShelvesRef.current = [];
    visibleRef.current = initialVisible;

    const session = sessionRef.current;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled || session !== sessionRef.current) return;
      setAllShelves([]);
      setVisibleShelfCount(initialVisible);
      setHasMoreCategories(true);
      setTotalCategoriesInRegion(null);
      setBootstrapping(true);
      setShelfError(null);
    });

    void (async () => {
      setLoading(true);
      try {
        const { yieldToMain } = await import("@/lib/yield-to-main");
        let built: LiveShelfMeta[] = [];
        let firstPaint = true;
        while (!cancelled && session === sessionRef.current) {
          const batch = await fetchBatch(
            categoryOffsetRef.current,
            SHELVES_PER_FETCH
          );
          if (cancelled || session !== sessionRef.current) return;
          if (batch.length) {
            built = [...built, ...batch];
            allShelvesRef.current = built;
            setAllShelves(built);
            const vis = firstPaint
              ? Math.min(initialVisible, built.length)
              : built.length;
            firstPaint = false;
            visibleRef.current = vis;
            setVisibleShelfCount(vis);
          }
          if (!hasMoreRef.current) break;
          await yieldToMain();
        }
        if (cancelled || session !== sessionRef.current) return;
        visibleRef.current = built.length;
        setVisibleShelfCount(built.length);
        prefetchNext();
      } catch (e) {
        if (cancelled || session !== sessionRef.current) return;
        const msg =
          e instanceof Error ? e.message : "Could not load live categories.";
        setShelfError(msg);
      } finally {
        if (!cancelled && session === sessionRef.current) {
          setBootstrapping(false);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    region,
    creds.server,
    creds.username,
    initialVisible,
    fetchBatch,
    prefetchNext,
  ]);

  /** Reveal every category already fetched (avoids dozens of "Show more" clicks). */
  const revealAllBuffered = useCallback(() => {
    const built = allShelvesRef.current.length;
    if (visibleRef.current >= built) return false;
    visibleRef.current = built;
    setVisibleShelfCount(built);
    return true;
  }, []);

  const revealAllBufferedDeferred = useCallback(() => {
    if (typeof requestAnimationFrame === "undefined") {
      return revealAllBuffered();
    }
    requestAnimationFrame(() => {
      revealAllBuffered();
    });
    return true;
  }, [revealAllBuffered]);

  const loadMoreShelves = useCallback(() => {
    if (!enabled || busyRef.current || bootstrapping) return;

    const built = allShelvesRef.current.length;
    const visible = visibleRef.current;

    if (visible < built) {
      revealAllBufferedDeferred();
      return;
    }

    if (!hasMoreRef.current) return;

    const prefetched = prefetchedRef.current;
    if (prefetched?.length) {
      appendShelves(prefetched);
      revealAllBufferedDeferred();
      return;
    }

    busyRef.current = true;
    const session = sessionRef.current;
    setLoading(true);

    void (async () => {
      try {
        const shelves = await fetchBatch(
          categoryOffsetRef.current,
          SHELVES_PER_FETCH
        );
        if (session !== sessionRef.current) return;
        if (shelves.length) appendShelves(shelves);
        revealAllBufferedDeferred();
      } finally {
        if (session === sessionRef.current) {
          busyRef.current = false;
          setLoading(false);
        }
      }
    })();
  }, [
    enabled,
    bootstrapping,
    revealAllBufferedDeferred,
    appendShelves,
    fetchBatch,
  ]);

  const resetForRegion = useCallback(() => {
    sessionRef.current += 1;
    categoryOffsetRef.current = 0;
    hasMoreRef.current = true;
    prefetchedRef.current = null;
    allShelvesRef.current = [];
    visibleRef.current = initialVisible;
    setAllShelves([]);
    setVisibleShelfCount(initialVisible);
    setHasMoreCategories(true);
    setTotalCategoriesInRegion(null);
    setBootstrapping(true);
  }, [initialVisible]);

  const shelvesReadyToReveal = Math.max(0, allShelves.length - visibleShelfCount);
  const hasMore =
    visibleShelfCount < allShelves.length || hasMoreCategories;

  const retryShelves = useCallback(() => {
    resetForRegion();
    sessionRef.current += 1;
    const session = sessionRef.current;
    categoryOffsetRef.current = 0;
    hasMoreRef.current = true;
    prefetchedRef.current = null;
    setShelfError(null);
    setBootstrapping(true);
    setLoading(true);

    void (async () => {
      try {
        const batch = await fetchBatch(0, SHELVES_PER_FETCH);
        if (session !== sessionRef.current) return;
        if (batch.length) {
          allShelvesRef.current = batch;
          setAllShelves(batch);
          const vis = Math.min(initialVisible, batch.length);
          visibleRef.current = vis;
          setVisibleShelfCount(vis);
        }
        prefetchNext();
      } catch (e) {
        if (session !== sessionRef.current) return;
        const msg =
          e instanceof Error ? e.message : "Could not load live categories.";
        setShelfError(msg);
      } finally {
        if (session === sessionRef.current) {
          setBootstrapping(false);
          setLoading(false);
        }
      }
    })();
  }, [resetForRegion, fetchBatch, prefetchNext, initialVisible]);

  return {
    allShelves,
    visibleShelfCount,
    hasMore,
    shelvesBuilding: loading,
    shelfError,
    retryShelves,
    moreCategoriesPending: hasMoreCategories,
    shelvesReadyToReveal,
    loadingMoreCategories: loading,
    loadMoreShelves,
    resetVisible: resetForRegion,
    totalCategoriesInRegion,
  };
}
