"use client";

import { ChannelArtworkCard } from "@/components/ChannelArtworkCard";
import { LiveDiscoveryShelf } from "@/components/LiveDiscoveryShelf";
import { LiveMediaCard } from "@/components/LiveMediaCard";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { DISCOVERY_SHELF_META } from "@/lib/discovery/shelf-meta";
import { tvLiveDiscoveryMinItems } from "@/lib/tv-playback-tune";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import { buildFeaturedLive, isDiscoveryShelvesEnabled } from "@/lib/discovery";
import { buildLivePlayUrl } from "@/lib/xtream";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";

type LiveDiscoverySectionsProps = {
  creds: XtreamCredentials;
  channels: LiveStream[];
  recents: RecentItem[];
  favorites: Favorite[];
  hideAdult: boolean;
  parentalUnlocked: boolean;
  onNow: ScoredLiveEntry[];
  tonight: ScoredLiveEntry[];
  sportsEvents?: ScoredLiveEntry[];
  sportsOnGuide?: ScoredLiveEntry[];
  showOnNow: boolean;
  showTonight: boolean;
  showSportsEvents?: boolean;
  showSportsOnGuide?: boolean;
  loading: boolean;
  sportsLoading?: boolean;
  onPlay: (stream: LiveStream) => void;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (stream: LiveStream) => void;
  /** When true, show featured fallback row if On now is empty. */
  showFeaturedFallback?: boolean;
  /** Grid shelves + featured row for TV remotes. */
  tvLayout?: boolean;
  /** TV home: horizontal shelves, no featured fallback. */
  tvHome?: boolean;
};

export function LiveDiscoverySections({
  creds,
  channels,
  recents,
  favorites,
  hideAdult,
  parentalUnlocked,
  onNow,
  tonight,
  sportsEvents = [],
  sportsOnGuide = [],
  showOnNow,
  showTonight,
  showSportsEvents = false,
  showSportsOnGuide = false,
  loading,
  sportsLoading = false,
  onPlay,
  isFavorite,
  onToggleFavorite,
  showFeaturedFallback = true,
  tvLayout = false,
  tvHome = false,
}: LiveDiscoverySectionsProps) {
  const layout = tvHome || tvLayout;
  if (!isDiscoveryShelvesEnabled()) return null;

  const featuredMin = layout ? tvLiveDiscoveryMinItems() : 1;
  const featured =
    showFeaturedFallback &&
    !showOnNow &&
    !showSportsEvents &&
    !showSportsOnGuide
      ? buildFeaturedLive(channels, recents, favorites, {
          hideAdult,
          parentalUnlocked,
          limit: layout ? 8 : 16,
        })
      : [];
  const showFeatured =
    featured.length >= featuredMin &&
    !showOnNow &&
    !showSportsEvents;

  const playEntry = (entry: ScoredLiveEntry) => onPlay(entry.stream);
  const toggleEntry = (entry: ScoredLiveEntry) =>
    onToggleFavorite(entry.stream);

  return (
    <>
      {(showOnNow || loading) && (
        <LiveDiscoveryShelf
          meta={DISCOVERY_SHELF_META.live_on_now}
          items={onNow}
          creds={creds}
          tvLayout={layout}
          tvHome={tvHome}
          loading={loading && onNow.length === 0}
          onPlay={playEntry}
          isFavorite={isFavorite}
          onToggleFavorite={toggleEntry}
        />
      )}
      {showTonight && (
        <LiveDiscoveryShelf
          meta={DISCOVERY_SHELF_META.live_tonight}
          items={tonight}
          creds={creds}
          tvLayout={layout}
          tvHome={tvHome}
          onPlay={playEntry}
          isFavorite={isFavorite}
          onToggleFavorite={toggleEntry}
        />
      )}
      {(showSportsEvents || sportsLoading) && (
        <LiveDiscoveryShelf
          meta={DISCOVERY_SHELF_META.live_sports_events}
          items={sportsEvents}
          creds={creds}
          tvLayout={layout}
          tvHome={tvHome}
          loading={sportsLoading && !showSportsEvents}
          onPlay={playEntry}
          isFavorite={isFavorite}
          onToggleFavorite={toggleEntry}
        />
      )}
      {showSportsOnGuide && (
        <LiveDiscoveryShelf
          meta={DISCOVERY_SHELF_META.live_sports_on_guide}
          items={sportsOnGuide}
          creds={creds}
          tvLayout={tvLayout}
          onPlay={playEntry}
          isFavorite={isFavorite}
          onToggleFavorite={toggleEntry}
        />
      )}
      {showFeatured && (
        <section>
          <SectionHeader
            eyebrow={DISCOVERY_SHELF_META.live_featured.eyebrow}
            title={DISCOVERY_SHELF_META.live_featured.title}
          />
          {tvLayout ? (
            <TvSpatialGrid className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {featured.map((stream) => (
                <ChannelArtworkCard
                  key={stream.stream_id}
                  channelName={stream.name}
                  icon={stream.stream_icon}
                  panelServer={creds.server}
                  badge="Live"
                  aspect="video"
                  onClick={() => onPlay(stream)}
                  isFavorite={isFavorite(stream.stream_id)}
                  onToggleFavorite={() => onToggleFavorite(stream)}
                />
              ))}
            </TvSpatialGrid>
          ) : (
            <div
              className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {featured.map((stream) => (
                <div key={stream.stream_id} className="shrink-0 w-28 sm:w-32">
                  <LiveMediaCard
                    streamId={stream.stream_id}
                    creds={creds}
                    warmPlaybackUrl={buildLivePlayUrl(creds, stream)}
                    title={stream.name}
                    poster={stream.stream_icon}
                    posterFit="contain"
                    badge="Live"
                    onClick={() => onPlay(stream)}
                    isFavorite={isFavorite(stream.stream_id)}
                    onToggleFavorite={() => onToggleFavorite(stream)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
