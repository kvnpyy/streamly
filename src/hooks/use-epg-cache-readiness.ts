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

const POLL_MS = 4_000;

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
    let poll: number | null = null;

    const stopPoll = () => {
      if (poll !== null) {
        window.clearInterval(poll);
        poll = null;
      }
    };

    const refresh = async () => {
      await whenEpgLocalCacheHydrated();
      if (cancelled) return;
      const next = countCachedEpgTitlesForAccount(server, username);
      setCount(next);
      if (next >= TRENDING_MIN_CACHED_EPG_TITLES) stopPoll();
    };

    void refresh();
    poll = window.setInterval(() => {
      void refresh();
    }, POLL_MS);

    const warmup = window.setTimeout(() => {
      if (cancelled) return;
      setWarmupDone(true);
      stopPoll();
    }, TRENDING_EPG_WARMUP_MS);

    return () => {
      cancelled = true;
      stopPoll();
      window.clearTimeout(warmup);
    };
  }, [enabled, server, username]);

  const ready =
    count >= TRENDING_MIN_CACHED_EPG_TITLES || warmupDone;

  return { count, ready, warmingUp: enabled && !ready };
}
