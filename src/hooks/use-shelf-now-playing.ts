"use client";

import { channelLooksLikeSports } from "@/lib/discovery/sports-keywords";
import { fetchClientChannelNowTitle } from "@/lib/client-channel-now-title";
import { isLiveShelfEpgEnabled } from "@/lib/live-epg-policy";
import {
  getBulkCachedEpgTitles,
  setCachedEpgTitlesBatch,
  whenEpgLocalCacheHydrated,
} from "@/lib/epg-local-cache";
import { maxConcurrentEpgFetches } from "@/lib/epg-fetch-limiter";
import { runWithConcurrency } from "@/lib/run-with-concurrency";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_SCAN_MAX = 48;

export type ShelfEpgChannel = Pick<
  LiveStream,
  "stream_id" | "name" | "category_id"
>;

function orderShelfEpgChannels(channels: ShelfEpgChannel[]): ShelfEpgChannel[] {
  return [...channels].sort((a, b) => {
    const sa = channelLooksLikeSports(a.name) ? 0 : 1;
    const sb = channelLooksLikeSports(b.name) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.stream_id - b.stream_id;
  });
}

/**
 * Cache-first "now playing" titles for shelf preview rows (web + TV browse).
 */
export function useShelfNowPlayingMap(
  creds: XtreamCredentials,
  channels: ShelfEpgChannel[],
  categoryNameById: Record<string, string>,
  enabled = true,
  maxScan = DEFAULT_SCAN_MAX
): Map<number, string> {
  const [map, setMap] = useState<Map<number, string>>(() => new Map());
  const active =
    enabled && isLiveShelfEpgEnabled() && channels.length > 0;

  const ordered = useMemo(
    () => orderShelfEpgChannels(channels).slice(0, maxScan),
    [channels, maxScan]
  );
  const streamKey = ordered.map((c) => c.stream_id).join(",");

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const run = async () => {
      await whenEpgLocalCacheHydrated();
      if (cancelled) return;

      const ids = ordered.map((c) => c.stream_id);
      const next = getBulkCachedEpgTitles(creds.server, creds.username, ids);
      if (!cancelled && next.size > 0) {
        setMap((prev) => {
          const merged = new Map(prev);
          for (const [id, title] of next) merged.set(id, title);
          return merged;
        });
      }

      const pending = ordered.filter((c) => !next.has(c.stream_id));
      if (!pending.length) return;

      const cacheBatch: Array<{ streamId: number; title: string }> = [];

      await runWithConcurrency(
        pending,
        maxConcurrentEpgFetches(),
        async (ch) => {
          try {
            const categoryLine = categoryNameById[ch.category_id] ?? "";
            const title = await fetchClientChannelNowTitle(
              creds,
              ch.stream_id,
              ch.name,
              categoryLine
            );
            if (cancelled || !title) return;
            cacheBatch.push({ streamId: ch.stream_id, title });
            setMap((prev) => {
              const merged = new Map(prev);
              merged.set(ch.stream_id, title);
              return merged;
            });
          } catch {
            /* skip */
          }
        }
      );

      if (!cancelled && cacheBatch.length > 0) {
        setCachedEpgTitlesBatch(creds.server, creds.username, cacheBatch);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [active, creds, categoryNameById, ordered, streamKey]);

  // Keep titles visible while loading more shelves (active may flicker off briefly).
  return useMemo(() => map, [map]);
}
