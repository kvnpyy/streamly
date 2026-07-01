"use client";

import { LiveChannelGridTile } from "@/components/live/LiveChannelGridTile";
import { VirtualLiveChannelGrid } from "@/components/VirtualMediaCatalogGrid";
import { useGlobalProgrammeSearch } from "@/hooks/use-global-programme-search";
import { liveChannelSearchQueryOptions } from "@/lib/live-catalog-search";
import { buildLiveChannelIndex } from "@/lib/live-channel-index";
import { isLiveProgrammeSearchEnabled } from "@/lib/live-epg-policy";
import { LIVE_LIST_MAX_CHANNELS } from "@/lib/live-guide-limits";
import type { TvRegion } from "@/lib/geo-continent";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { useQuery } from "@tanstack/react-query";
import { SkeletonGrid } from "@/components/SectionHeader";
import { useMemo } from "react";

/** Full-catalog channel search on the lightweight shelf route (name + optional EPG). */
export function LiveShelfNameSearch({
  creds,
  qLower,
  categoryNameById,
  tvRegion,
  openChannel,
  isFavorite,
  onToggleFavorite,
}: {
  creds: XtreamCredentials;
  qLower: string;
  categoryNameById: Record<string, string>;
  tvRegion: TvRegion;
  openChannel: (c: LiveStream) => void;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (c: LiveStream) => void;
}) {
  const programmeSearchOn = isLiveProgrammeSearchEnabled();

  const searchQuery = useQuery(
    liveChannelSearchQueryOptions(creds, qLower, "all", tvRegion, Boolean(qLower))
  );

  const nameMatched = searchQuery.data?.matches ?? [];
  const scanPool = searchQuery.data?.scanPool ?? nameMatched;

  const channelIndex = useMemo(() => {
    if (!qLower || !scanPool.length) return null;
    return buildLiveChannelIndex(scanPool);
  }, [qLower, scanPool]);

  const { liveMatches, programmeScanning } = useGlobalProgrammeSearch(
    creds,
    qLower,
    nameMatched,
    channelIndex,
    programmeSearchOn && Boolean(qLower) && Boolean(channelIndex)
  );

  const matches = programmeSearchOn ? liveMatches : nameMatched;

  if (searchQuery.isLoading || searchQuery.isFetching) {
    return <SkeletonGrid variant="tile" count={8} />;
  }

  if (!matches.length && !programmeScanning) {
    return (
      <div className="card p-8 text-center text-sm text-(--text-muted)">
        No channels match your search. Try a shorter name, another spelling, or
        pick a category from the sidebar.
      </div>
    );
  }

  return (
    <>
      {programmeScanning && matches.length === 0 ? (
        <p className="text-xs text-(--text-muted) mb-3">
          Searching on-air programmes…
        </p>
      ) : null}
      <VirtualLiveChannelGrid
        items={matches}
        maxItems={LIVE_LIST_MAX_CHANNELS}
        itemKey={(c) => c.stream_id}
        renderItem={(c) => (
          <LiveChannelGridTile
            stream={c}
            categoryLine={categoryNameById[c.category_id]}
            isFavorite={isFavorite(c.stream_id)}
            onToggleFavorite={() => onToggleFavorite(c)}
            onPlay={() => openChannel(c)}
          />
        )}
      />
    </>
  );
}
