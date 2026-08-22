"use client";

import { shortEpgQueryOptions } from "@/lib/epg-query-options";
import { nowPlayingTitleFromListings } from "@/lib/epg-text";
import {
  LIVE_SEARCH_EPG_LIMIT,
  mergeLiveSearchResults,
  planLiveProgrammeSearch,
  seedProgrammeSearchFromCache,
} from "@/lib/live-programme-search";
import type { LiveChannelIndex } from "@/lib/live-channel-index";
import { setCachedEpgTitlesBatch } from "@/lib/epg-local-cache";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

/** Prefer scanning after name hits; raise slightly for better programme recall. */
const GLOBAL_SEARCH_EPG_SCAN = 48;
const GLOBAL_SEARCH_EPG_CONCURRENCY = 4;

export function useGlobalProgrammeSearch(
  creds: XtreamCredentials | null,
  queryLower: string,
  nameMatched: LiveStream[],
  channelIndex: LiveChannelIndex | null,
  enabled: boolean
) {
  const queryClient = useQueryClient();
  const [programmeTitles, setProgrammeTitles] = useState(
    () => new Map<number, string>()
  );
  const [scanning, setScanning] = useState(false);

  const plan = useMemo(() => {
    if (!enabled || !channelIndex || !queryLower) return null;
    return planLiveProgrammeSearch(
      channelIndex,
      queryLower,
      GLOBAL_SEARCH_EPG_SCAN
    );
  }, [enabled, channelIndex, queryLower]);

  useEffect(() => {
    if (!enabled || !creds || !queryLower || !plan?.candidateIds.length) {
      queueMicrotask(() => {
        setProgrammeTitles((prev) => (prev.size === 0 ? prev : new Map()));
        setScanning(false);
      });
      return;
    }

    const { hits, knownIds } = seedProgrammeSearchFromCache(
      creds,
      plan.candidateIds,
      queryLower
    );
    const indexMap = new Map(hits);
    const pending = plan.candidateIds.filter((id) => !knownIds.has(id));
    queueMicrotask(() => {
      setProgrammeTitles(new Map(indexMap));
      setScanning(pending.length > 0);
    });

    let cancelled = false;
    const cacheBatch: Array<{ streamId: number; title: string }> = [];

    void (async () => {
      const candidates = pending;
      const nowSec = Math.floor(Date.now() / 1000);
      for (let i = 0; i < candidates.length; i += GLOBAL_SEARCH_EPG_CONCURRENCY) {
        if (cancelled) break;
        const slice = candidates.slice(i, i + GLOBAL_SEARCH_EPG_CONCURRENCY);
        await Promise.all(
          slice.map(async (streamId) => {
            try {
              const data = await queryClient.fetchQuery(
                shortEpgQueryOptions(creds, streamId, LIVE_SEARCH_EPG_LIMIT)
              );
              if (cancelled) return;
              const listings = data?.epg_listings;
              if (!listings?.length) return;
              const title = nowPlayingTitleFromListings(listings, nowSec);
              if (title) {
                indexMap.set(streamId, title);
                cacheBatch.push({ streamId, title });
              }
            } catch {
              /* skip */
            }
          })
        );
        if (!cancelled) setProgrammeTitles(new Map(indexMap));
      }
      if (!cancelled) {
        if (cacheBatch.length > 0) {
          setCachedEpgTitlesBatch(creds.server, creds.username, cacheBatch);
        }
        setScanning(false);
      }
    })();

    return () => {
      cancelled = true;
      queueMicrotask(() => setScanning(false));
    };
  }, [enabled, creds, queryLower, plan, queryClient]);

  const programmeMatched = useMemo(() => {
    if (!enabled || !channelIndex || !queryLower) return [];
    return mergeLiveSearchResults(
      nameMatched,
      channelIndex.items,
      queryLower,
      new Map(),
      programmeTitles
    );
  }, [enabled, channelIndex, queryLower, nameMatched, programmeTitles]);

  const programmeOnlyCount = Math.max(
    0,
    programmeMatched.length - nameMatched.length
  );

  return {
    liveMatches: programmeMatched,
    programmeScanning: scanning,
    programmeOnlyCount,
  };
}
