"use client";

import { RegionalTrendingShelf } from "@/components/RegionalTrendingShelf";
import {
  coerceTvRegion,
  detectRegionFromTimezone,
  type TvRegion,
} from "@/lib/geo-continent";
import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
} from "@/lib/live-flip-playlist";
import { useRegionalTrending } from "@/hooks/use-regional-trending";
import { useTrendingOnTv } from "@/hooks/use-trending-on-tv";
import type {
  LiveStream,
  SeriesItem,
  VodStream,
  XtreamCredentials,
} from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";

type HomeRegionalTrendingSectionProps = {
  creds: XtreamCredentials;
  movies: VodStream[] | undefined;
  series: SeriesItem[] | undefined;
  vodLoading: boolean;
  recents: RecentItem[];
  favorites: Favorite[];
  hideAdult: boolean;
  parentalUnlocked: boolean;
  isFavorite: (kind: "movie" | "series" | "live", id: number) => boolean;
  toggleFavoriteMovie: (m: VodStream, mid: number) => void;
  toggleFavoriteSeries: (s: SeriesItem, sid: number) => void;
  toggleFavoriteLive: (stream: LiveStream) => void;
  enabled?: boolean;
};

export function HomeRegionalTrendingSection({
  creds,
  movies,
  series,
  vodLoading,
  recents,
  favorites,
  hideAdult,
  parentalUnlocked,
  isFavorite,
  toggleFavoriteMovie,
  toggleFavoriteSeries,
  toggleFavoriteLive,
  enabled = true,
}: HomeRegionalTrendingSectionProps) {
  const play = usePlayer((s) => s.play);
  const discoveryOn = isDiscoveryShelvesEnabled();
  const storedRegion = usePrefs((s) => s.tvRegionFilter);

  const tvRegion: TvRegion =
    coerceTvRegion(storedRegion) ?? detectRegionFromTimezone();

  const trendingOnTv = useTrendingOnTv({
    creds,
    tvRegion,
    recents,
    favorites,
    enabled: discoveryOn && enabled,
  });

  const regional = useRegionalTrending({
    movies,
    series,
    sportsEvents: [],
    trendingOnTv: trendingOnTv.items,
    onNow: [],
    tonight: [],
    epgLoading: trendingOnTv.loading,
    vodLoading,
    hideAdult,
    parentalUnlocked,
    isFavorite,
    toggleFavoriteMovie,
    toggleFavoriteSeries,
    tvRegion,
    enabled: discoveryOn && enabled,
  });

  if (!discoveryOn || (!regional.show && !regional.loading)) return null;

  return (
    <RegionalTrendingShelf
      meta={regional.meta}
      items={regional.items}
      creds={creds}
      loading={regional.loading}
      onPlayLive={(card) => {
        if (!card.stream) return;
        play(liveStreamToPlayerSource(creds, card.stream), {
          playlist: buildLiveFlipPlaylist(creds, [card.stream]),
        });
      }}
      isFavoriteLive={(id) => isFavorite("live", id)}
      onToggleFavoriteLive={(card) => {
        if (!card.stream) return;
        toggleFavoriteLive(card.stream);
      }}
    />
  );
}
