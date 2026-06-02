"use client";

import { LiveChannelGridTile } from "@/components/live/LiveChannelGridTile";
import { VirtualLiveChannelGrid } from "@/components/VirtualMediaCatalogGrid";
import {
  liveCategoryChannelsQueryOptions,
} from "@/lib/live-catalog-channels";
import { LIVE_LIST_MAX_CHANNELS } from "@/lib/live-guide-limits";
import {
  buildLiveChannelIndex,
  filterLiveChannelsByName,
} from "@/lib/live-channel-index";
import { EMPTY_LIVE_STREAMS } from "@/lib/live-browse-streams";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { useQuery } from "@tanstack/react-query";
import { SkeletonGrid } from "@/components/SectionHeader";
import { useDeferredValue, useMemo } from "react";

/** Name-only channel search while staying on the lightweight shelf route. */
export function LiveShelfNameSearch({
  creds,
  qLower,
  categoryNameById,
  openChannel,
  isFavorite,
  onToggleFavorite,
}: {
  creds: XtreamCredentials;
  qLower: string;
  categoryNameById: Record<string, string>;
  openChannel: (c: LiveStream) => void;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (c: LiveStream) => void;
}) {
  const channelsQuery = useQuery(
    liveCategoryChannelsQueryOptions(
      creds,
      "all",
      LIVE_LIST_MAX_CHANNELS,
      Boolean(qLower)
    )
  );

  const channels = channelsQuery.data ?? EMPTY_LIVE_STREAMS;
  const deferred = useDeferredValue(channels);

  const index = useMemo(
    () => (deferred.length ? buildLiveChannelIndex(deferred) : null),
    [deferred]
  );

  const matches = useMemo(() => {
    if (!qLower || !index) return [];
    return filterLiveChannelsByName(index, qLower);
  }, [index, qLower]);

  if (channelsQuery.isLoading || channelsQuery.isFetching) {
    return <SkeletonGrid variant="tile" count={8} />;
  }

  if (!matches.length) {
    return (
      <div className="card p-8 text-center text-sm text-(--text-muted)">
        No channel names match your search. Try a shorter name or pick a category
        from the sidebar.
      </div>
    );
  }

  return (
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
  );
}
