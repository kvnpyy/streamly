"use client";

import { LiveDiscoverySections } from "@/components/LiveDiscoverySections";
import { RegionalTrendingShelf } from "@/components/RegionalTrendingShelf";
import type { RegionalTrendingCard } from "@/lib/discovery/regional-trending-types";
import type { DiscoveryShelfMeta } from "@/lib/discovery/types";
import { LiveMediaCard } from "@/components/LiveMediaCard";
import { MediaCard } from "@/components/MediaCard";
import { TvHomeQuickNav } from "@/components/tv/TvHomeQuickNav";
import { TvHomeRow } from "@/components/tv/TvHomeRow";
import { TvShelf } from "@/components/TvShelf";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import { SkeletonGrid } from "@/components/SectionHeader";
import type { LiveStream, SeriesItem, VodStream, XtreamCredentials } from "@/lib/xtream-types";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
  stubLiveStreamFromRecent,
} from "@/lib/live-flip-playlist";
import { buildLivePlayUrl } from "@/lib/xtream";
import {
  Clapperboard,
  PlaySquare,
  Tv,
} from "lucide-react";
import type { Favorite, RecentItem } from "@/store/preferences";

import type { PlayerPlaylist, PlayerSource } from "@/store/player";

export type TvHomeHubProps = {
  greetingName: string;
  creds: XtreamCredentials;
  liveLoading: boolean;
  vodLoading: boolean;
  seriesLoading: boolean;
  liveCount?: number;
  vodCount?: number;
  seriesCount?: number;
  favoritesCount: number;
  topRatedMovies: VodStream[];
  trendingMovies: Array<{
    id: number;
    href: string;
    poster?: string;
    title: string;
    subtitle?: string;
    rating?: string;
    isFavorite?: boolean;
    onToggleFavorite?: () => void;
  }>;
  movieTrendingFromTmdb?: boolean;
  newSeries: SeriesItem[];
  safeLiveChannels: LiveStream[];
  liveDiscovery: {
    onNow: ScoredLiveEntry[];
    tonight: ScoredLiveEntry[];
    sportsEvents: ScoredLiveEntry[];
    sportsOnGuide: ScoredLiveEntry[];
    showOnNow: boolean;
    showTonight: boolean;
    showSportsEvents: boolean;
    showSportsOnGuide: boolean;
    loading: boolean;
    sportsLoading: boolean;
  };
  regionalTrending: {
    items: RegionalTrendingCard[];
    show: boolean;
    loading: boolean;
    meta: DiscoveryShelfMeta;
  };
  onOpenLive: (stream: LiveStream) => void;
  hideAdult: boolean;
  parentalUnlocked: boolean;
  recents: RecentItem[];
  favorites: Favorite[];
  parseMovieId: (m: VodStream) => number | null;
  parseSeriesId: (s: SeriesItem) => number | null;
  play: (s: PlayerSource, opts?: { playlist?: PlayerPlaylist }) => void;
  addRecent: (f: Omit<Favorite, "addedAt">) => void;
  isFavorite: (kind: Favorite["kind"], id: number) => boolean;
  toggleFavorite: (f: Omit<Favorite, "addedAt">) => void;
  showCatalogShelves?: boolean;
};

export function TvHomeHub({
  greetingName,
  creds,
  liveLoading,
  regionalTrending,
  onOpenLive,
  recents,
  safeLiveChannels,
  favorites,
  hideAdult,
  parentalUnlocked,
  liveDiscovery,
  play,
  addRecent,
  isFavorite,
  toggleFavorite,
}: TvHomeHubProps) {
  const showContinue =
    recents.length > 0 &&
    !regionalTrending.loading &&
    regionalTrending.items.length > 0;

  return (
    <div className="tv-home">
      <header className="tv-home__hero">
        <h1 className="tv-home__greeting">
          Hey <span>{greetingName}</span>
        </h1>
        <TvHomeQuickNav
          items={[
            {
              href: "/app/live",
              label: "Live TV",
              icon: Tv,
            },
            {
              href: "/app/movies",
              label: "Movies",
              icon: Clapperboard,
            },
            {
              href: "/app/series",
              label: "Series",
              icon: PlaySquare,
            },
          ]}
        />
      </header>

      {(regionalTrending.show || regionalTrending.loading) && (
        <RegionalTrendingShelf
          meta={regionalTrending.meta}
          items={regionalTrending.items}
          creds={creds}
          tvHome
          loading={regionalTrending.loading}
          onPlayLive={(card) => {
            if (card.stream) onOpenLive(card.stream);
          }}
          isFavoriteLive={(id) => isFavorite("live", id)}
          onToggleFavoriteLive={(card) => {
            if (!card.stream) return;
            toggleFavorite({
              kind: "live",
              id: card.stream.stream_id,
              name: card.stream.name,
              icon: card.stream.stream_icon,
              ...(card.stream.direct_source?.trim()
                ? { meta: { direct_source: card.stream.direct_source.trim() } }
                : {}),
            });
          }}
        />
      )}

      {showContinue && (
        <TvHomeRow
          title="Continue watching"
          seeAllHref="/app/favorites"
          className="tv-home-continue"
        >
          <TvShelf title="Continue" hideTitle seeAllHref="/app/favorites">
            {recents.slice(0, 8).map((r) =>
              r.kind === "live" ? (
                <div key={`live-${r.id}`} className="tv-home-shelf-card">
                  <LiveMediaCard
                    streamId={r.id}
                    creds={creds}
                    title={r.name}
                    poster={r.icon}
                    posterFit="contain"
                    badge="Live"
                    warmPlaybackUrl={buildLivePlayUrl(creds, {
                      stream_id: r.id,
                      direct_source:
                        typeof r.meta?.direct_source === "string"
                          ? r.meta.direct_source
                          : undefined,
                    })}
                    onClick={() => {
                      const stream = stubLiveStreamFromRecent(r);
                      const flipStreams = recents
                        .filter((x) => x.kind === "live")
                        .map(stubLiveStreamFromRecent);
                      play(liveStreamToPlayerSource(creds, stream), {
                        playlist: buildLiveFlipPlaylist(
                          creds,
                          flipStreams.length > 1
                            ? flipStreams
                            : safeLiveChannels
                        ),
                      });
                      addRecent(r);
                    }}
                    isFavorite={isFavorite("live", r.id)}
                    onToggleFavorite={() =>
                      toggleFavorite({
                        kind: "live",
                        id: r.id,
                        name: r.name,
                        icon: r.icon,
                      })
                    }
                  />
                </div>
              ) : (
                <div key={`${r.kind}-${r.id}`} className="tv-home-shelf-card">
                  <MediaCard
                    title={r.name}
                    poster={r.icon}
                    panelServer={creds.server}
                    badge={r.kind === "movie" ? "Movie" : "Series"}
                    href={
                      r.kind === "movie"
                        ? `/app/movies/${r.id}`
                        : `/app/series/${r.id}`
                    }
                    isFavorite={isFavorite(r.kind, r.id)}
                    onToggleFavorite={() =>
                      toggleFavorite({
                        kind: r.kind,
                        id: r.id,
                        name: r.name,
                        icon: r.icon,
                      })
                    }
                  />
                </div>
              )
            )}
          </TvShelf>
        </TvHomeRow>
      )}

      {liveDiscovery.loading &&
      !liveDiscovery.showOnNow &&
      liveDiscovery.onNow.length === 0 ? (
        <TvHomeRow title="On now" subtitle="From your programme guide">
          <SkeletonGrid variant="tile" count={5} />
        </TvHomeRow>
      ) : (
        <LiveDiscoverySections
          creds={creds}
          channels={safeLiveChannels}
          recents={recents}
          favorites={favorites}
          hideAdult={hideAdult}
          parentalUnlocked={parentalUnlocked}
          tvHome
          onNow={liveDiscovery.onNow.slice(0, 6)}
          tonight={[]}
          sportsEvents={liveDiscovery.sportsEvents.slice(0, 6)}
          sportsOnGuide={[]}
          showOnNow={liveDiscovery.showOnNow}
          showTonight={false}
          showSportsEvents={liveDiscovery.showSportsEvents}
          showSportsOnGuide={false}
          loading={liveDiscovery.loading}
          sportsLoading={liveDiscovery.sportsLoading}
          showFeaturedFallback={false}
          onPlay={onOpenLive}
          isFavorite={(id) => isFavorite("live", id)}
          onToggleFavorite={(c) =>
            toggleFavorite({
              kind: "live",
              id: c.stream_id,
              name: c.name,
              icon: c.stream_icon,
              ...(c.direct_source?.trim()
                ? { meta: { direct_source: c.direct_source.trim() } }
                : {}),
            })
          }
        />
      )}
    </div>
  );
}
