"use client";

import {
  buildLiveSearchHitsByCategory,
  type BuildLiveSearchHitsOptions,
} from "@/lib/live-shelf-search-hits";
import { yieldToMain } from "@/lib/yield-to-main";
import type { LiveStream } from "@/lib/xtream-types";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";

const CATEGORY_IDS_PER_CHUNK = 20;

export type UseLiveShelfSearchHitsOptions = Omit<
  BuildLiveSearchHitsOptions,
  "categoryIds" | "queryLower"
> & {
  queryLower: string;
  categoryIds: readonly string[];
  streamById: Map<number, LiveStream>;
  enabled?: boolean;
};

/**
 * Builds shelf search hits in idle chunks so typing on large catalogs cannot freeze the tab.
 */
export function useLiveShelfSearchHits({
  queryLower,
  categoryIds,
  enabled = true,
  streamById,
  streamIdsByCategory,
  streams,
  nameLowerById,
  nowPlayingMap,
  programTitleByStreamId,
  maxHitsPerCategory,
}: UseLiveShelfSearchHitsOptions) {
  const [hits, setHits] = useState<Map<string, LiveStream[]> | null>(null);
  const [building, setBuilding] = useState(false);
  const genRef = useRef(0);
  const deferredHits = useDeferredValue(hits);

  useEffect(() => {
    if (!enabled || !queryLower || !streamById) {
      genRef.current += 1;
      queueMicrotask(() => {
        setHits(null);
        setBuilding(false);
      });
      return;
    }

    const gen = ++genRef.current;
    queueMicrotask(() => {
      setHits(null);
      setBuilding(true);
    });

    void (async () => {
      const merged = new Map<string, LiveStream[]>();
      for (let i = 0; i < categoryIds.length; i += CATEGORY_IDS_PER_CHUNK) {
        if (gen !== genRef.current) return;
        const slice = categoryIds.slice(i, i + CATEGORY_IDS_PER_CHUNK);
        const chunk = buildLiveSearchHitsByCategory({
          queryLower,
          streamIdsByCategory,
          streamById,
          streams,
          nameLowerById,
          nowPlayingMap,
          programTitleByStreamId,
          maxHitsPerCategory,
          categoryIds: slice,
        });
        for (const [catId, list] of chunk) merged.set(catId, list);
        const snapshot = new Map(merged);
        startTransition(() => setHits(snapshot));
        await yieldToMain();
      }
      if (gen !== genRef.current) return;
      startTransition(() => {
        setHits(merged);
        setBuilding(false);
      });
    })();

    return () => {
      genRef.current += 1;
    };
  }, [
    enabled,
    queryLower,
    categoryIds,
    streamIdsByCategory,
    streamById,
    streams,
    nameLowerById,
    nowPlayingMap,
    programTitleByStreamId,
    maxHitsPerCategory,
  ]);

  return {
    searchHitsByCategory: queryLower ? deferredHits : null,
    searchHitsBuilding: building,
  };
}
