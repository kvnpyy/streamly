"use client";

import type { TvHomeHubProps } from "@/components/TvHomeHub";
import { useLiveDiscoveryEpg } from "@/hooks/use-live-discovery-epg";
import { useRegionalTrending } from "@/hooks/use-regional-trending";
import { useTrendingOnTv } from "@/hooks/use-trending-on-tv";
import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
} from "@/lib/live-flip-playlist";
import {
  coerceTvRegion,
  detectRegionFromTimezone,
  type TvRegion,
} from "@/lib/geo-continent";
import { buildHomeLiveChannelList } from "@/lib/home-live-channels";
import { looksAdult } from "@/lib/utils";
import type { SeriesItem, VodStream, XtreamCredentials } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import type { PlayerPlaylist, PlayerSource } from "@/store/player";
import { useCallback, useEffect, useMemo } from "react";
import { usePrefs } from "@/store/preferences";

type UseTvHomeHubModelArgs = {
  greetingName: string;
  creds: XtreamCredentials;
  movies?: VodStream[] | undefined;
  series?: SeriesItem[] | undefined;
  vodCount?: number;
  seriesCount?: number;
  vodLoading: boolean;
  seriesLoading: boolean;
  recents: RecentItem[];
  favorites: Favorite[];
  hideAdult: boolean;
  parentalUnlocked: boolean;
  isFavorite: (kind: Favorite["kind"], id: number) => boolean;
  toggleFavorite: (f: Omit<Favorite, "addedAt">) => void;
  play: (s: PlayerSource, opts?: { playlist?: PlayerPlaylist }) => void;
  addRecent: (f: Omit<Favorite, "addedAt">) => void;
};

export function useTvHomeHubModel({
  greetingName,
  creds,
  movies,
  series,
  vodCount,
  seriesCount,
  vodLoading,
  seriesLoading,
  recents,
  favorites,
  hideAdult,
  parentalUnlocked,
  isFavorite,
  toggleFavorite,
  play,
  addRecent,
}: UseTvHomeHubModelArgs): TvHomeHubProps {
  const discoveryOn = isDiscoveryShelvesEnabled();
  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const setStoredRegion = usePrefs((s) => s.setTvRegionFilter);

  useEffect(() => {
    if (storedRegion === null) {
      setStoredRegion(detectRegionFromTimezone());
    }
  }, [storedRegion, setStoredRegion]);

  const tvRegion: TvRegion = coerceTvRegion(storedRegion) ?? "All";
  const safe = hideAdult && !parentalUnlocked;

  const safeLiveChannels = useMemo(() => {
    const list = buildHomeLiveChannelList(recents, favorites);
    if (!safe) return list;
    return list.filter(
      (c) => !looksAdult({ name: c.name, is_adult: c.is_adult })
    );
  }, [recents, favorites, safe]);

  const liveDiscovery = useLiveDiscoveryEpg({
    channels: safeLiveChannels,
    creds,
    recents,
    favorites,
    enabled: discoveryOn && safeLiveChannels.length > 0,
    livingRoom: true,
  });

  const trendingOnTv = useTrendingOnTv({
    creds,
    tvRegion,
    recents,
    favorites,
    enabled: discoveryOn,
  });

  const regional = useRegionalTrending({
    movies,
    series,
    sportsEvents: [],
    trendingOnTv: trendingOnTv.items,
    onNow: liveDiscovery.onNow,
    tonight: liveDiscovery.tonight,
    epgLoading: liveDiscovery.loading,
    vodLoading,
    hideAdult,
    parentalUnlocked,
    isFavorite,
    toggleFavoriteMovie: (m, mid) =>
      toggleFavorite({
        kind: "movie",
        id: mid,
        name: m.name,
        icon: m.stream_icon,
      }),
    toggleFavoriteSeries: (s, sid) =>
      toggleFavorite({
        kind: "series",
        id: sid,
        name: s.name,
        icon: s.cover,
      }),
    tvRegion,
    enabled: discoveryOn,
  });

  const onOpenLive = useCallback(
    (stream: import("@/lib/xtream-types").LiveStream) => {
      play(liveStreamToPlayerSource(creds, stream), {
        playlist: buildLiveFlipPlaylist(
          creds,
          safeLiveChannels.length > 0 ? safeLiveChannels : [stream]
        ),
      });
      addRecent({
        kind: "live",
        id: stream.stream_id,
        name: stream.name,
        icon: stream.stream_icon,
        ...(stream.direct_source?.trim()
          ? { meta: { direct_source: stream.direct_source.trim() } }
          : {}),
      });
    },
    [play, creds, safeLiveChannels, addRecent]
  );

  return {
    greetingName,
    creds,
    liveLoading: false,
    vodLoading,
    seriesLoading,
    liveCount: safeLiveChannels.length,
    vodCount: vodCount ?? movies?.length,
    seriesCount: seriesCount ?? series?.length,
    favoritesCount: favorites.length,
    topRatedMovies: [],
    trendingMovies: [],
    newSeries: [],
    safeLiveChannels,
    liveDiscovery: {
      onNow: liveDiscovery.onNow,
      tonight: liveDiscovery.tonight,
      sportsEvents: liveDiscovery.sportsEvents,
      sportsOnGuide: liveDiscovery.sportsOnGuide,
      showOnNow: liveDiscovery.showOnNow,
      showTonight: liveDiscovery.showTonight,
      showSportsEvents: liveDiscovery.showSportsEvents,
      showSportsOnGuide: liveDiscovery.showSportsOnGuide,
      loading: liveDiscovery.loading,
      sportsLoading: liveDiscovery.sportsLoading,
    },
    regionalTrending: {
      items: regional.items,
      show: regional.show,
      loading: regional.loading,
      meta: regional.meta,
    },
    onOpenLive,
    hideAdult,
    parentalUnlocked,
    recents,
    favorites,
    parseMovieId: () => null,
    parseSeriesId: () => null,
    play,
    addRecent,
    isFavorite,
    toggleFavorite,
    showCatalogShelves: false,
  };
}
