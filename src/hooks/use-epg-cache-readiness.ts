"use client";

import {
  countCachedEpgTitlesForAccount,
  whenEpgLocalCacheHydrated,
} from "@/lib/epg-local-cache";
import { useEffect, useState } from "react";

/** Wait for shelf EPG to populate cache before first Trending on TV request. */
export const TRENDING_MIN_CACHED_EPG_TITLES = 10;

/** Max wait before trending runs even if cache is still sparse. */
export const TRENDING_EPG_WARMUP_MS = 6_000;

const POLL_MS = 1_500;

/**
 * Tracks how many EPG titles are cached for an account and when trending
 * discovery is allowed to start (enough cache or warmup elapsed).
 */
export function useEpgCacheReadiness(
  server: string,
  username: string,
  enabled: boolean
) {
  const [count, setCount] = useState(0);
  const [warmupDone, setWarmupDone] = useState(false);

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => {
        setCount(0);
        setWarmupDone(false);
      });
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      await whenEpgLocalCacheHydrated();
      if (cancelled) return;
      setCount(countCachedEpgTitlesForAccount(server, username));
    };

    void refresh();
    const poll = setInterval(() => void refresh(), POLL_MS);
    const warmup = setTimeout(() => {
      if (!cancelled) setWarmupDone(true);
    }, TRENDING_EPG_WARMUP_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearTimeout(warmup);
    };
  }, [enabled, server, username]);

  const ready =
    count >= TRENDING_MIN_CACHED_EPG_TITLES || warmupDone;

  return { count, ready, warmingUp: enabled && !ready };
}
