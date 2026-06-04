"use client";

import { LiveDiscoveryShelf } from "@/components/LiveDiscoveryShelf";
import { DISCOVERY_SHELF_META } from "@/lib/discovery/shelf-meta";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
  LIVE_CATEGORY_FLIP_LIMIT,
  orderLiveStreamsForFlip,
} from "@/lib/live-flip-playlist";
import { useTrendingOnTv } from "@/hooks/use-trending-on-tv";
import type { TvRegion } from "@/lib/geo-continent";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import { usePlayer } from "@/store/player";

type LiveTrendingOnTvBlockProps = {
  creds: XtreamCredentials;
  tvRegion: TvRegion;
  recents?: RecentItem[];
  favorites?: Favorite[];
  enabled?: boolean;
  tvLayout?: boolean;
  onRecent?: (stream: import("@/lib/xtream-types").LiveStream) => void;
  isFavorite: (streamId: number) => boolean;
  onToggleFavorite: (stream: import("@/lib/xtream-types").LiveStream) => void;
};

export function LiveTrendingOnTvBlock({
  creds,
  tvRegion,
  recents = [],
  favorites = [],
  enabled = true,
  tvLayout = false,
  onRecent,
  isFavorite,
  onToggleFavorite,
}: LiveTrendingOnTvBlockProps) {
  const play = usePlayer((s) => s.play);
  const trending = useTrendingOnTv({
    creds,
    tvRegion,
    recents,
    favorites,
    enabled,
  });

  const playEntry = (entry: ScoredLiveEntry) => {
    const pool = trending.items.length ? trending.items : [entry];
    const ordered = orderLiveStreamsForFlip(
      pool.map((e) => e.stream),
      entry.stream.stream_id
    );
    play(liveStreamToPlayerSource(creds, entry.stream), {
      playlist: buildLiveFlipPlaylist(creds, ordered, LIVE_CATEGORY_FLIP_LIMIT),
    });
    onRecent?.(entry.stream);
  };

  if (!trending.show) return null;

  if (!trending.loading && !trending.warmingUp && !trending.hasItems) {
    return null;
  }

  return (
    <LiveDiscoveryShelf
      meta={DISCOVERY_SHELF_META.live_trending_on_tv}
      items={trending.items}
      creds={creds}
      tvLayout={tvLayout}
      loading={
        (trending.loading || trending.warmingUp) && trending.items.length === 0
      }
      onPlay={playEntry}
      isFavorite={isFavorite}
      onToggleFavorite={(entry) => onToggleFavorite(entry.stream)}
    />
  );
}
