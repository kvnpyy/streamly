"use client";

import {
  buildNameSearchIndex,
  buildNameSearchIndexChunked,
  type NameSearchIndex,
} from "@/lib/name-search-index";
import { useEffect, useRef, useState } from "react";

const SYNC_INDEX_MAX = 2_400;

/**
 * Build a lowercase name index only while search is active.
 * Large catalogs use chunked async builds so Chrome/desktop tabs stay responsive.
 */
export function useChunkedNameSearchIndex<T>(
  items: T[],
  getName: (item: T) => string,
  enabled: boolean
): NameSearchIndex<T> | null {
  const [index, setIndex] = useState<NameSearchIndex<T> | null>(null);
  const getNameRef = useRef(getName);

  useEffect(() => {
    getNameRef.current = getName;
  }, [getName]);

  useEffect(() => {
    if (!enabled || items.length === 0) {
      queueMicrotask(() => setIndex(null));
      return;
    }

    let cancelled = false;
    const readName = (item: T) => getNameRef.current(item);

    if (items.length <= SYNC_INDEX_MAX) {
      const built = buildNameSearchIndex(items, readName);
      queueMicrotask(() => {
        if (!cancelled) setIndex(built);
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => setIndex(null));
    void buildNameSearchIndexChunked(items, readName).then((built) => {
      if (!cancelled) setIndex(built);
    });

    return () => {
      cancelled = true;
    };
  }, [items, enabled]);

  return enabled ? index : null;
}
