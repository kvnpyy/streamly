"use client";

import { mapsShallowEqual } from "@/lib/maps-shallow-equal";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Batches rapid Map replacements into one commit per animation frame —
 * stops programme-search EPG scans from triggering 30+ React renders/sec.
 */
export function useRafBatchedMap<K, V>(
  initial?: () => Map<K, V>
): [Map<K, V>, (next: Map<K, V>) => void] {
  const [state, setState] = useState<Map<K, V>>(
    initial ?? (() => new Map())
  );
  const pendingRef = useRef<Map<K, V> | null>(null);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    setState((prev) => (mapsShallowEqual(prev, next) ? prev : new Map(next)));
  }, []);

  const setMap = useCallback(
    (next: Map<K, V>) => {
      pendingRef.current = next;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(flush);
    },
    [flush]
  );

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return [state, setMap];
}
