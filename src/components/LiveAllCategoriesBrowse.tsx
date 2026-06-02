"use client";

import { WebLiveBrowse } from "@/components/WebLiveBrowse";
import { TvLiveBrowse } from "@/components/TvLiveBrowse";
import type { Category, LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import type { Favorite } from "@/store/preferences";
import { memo } from "react";

const EMPTY_NOW_PLAYING = new Map<number, string>();

export type LiveAllCategoriesBrowseProps = {
  variant: "web" | "tv";
  categories: Category[];
  streams: LiveStream[];
  creds: XtreamCredentials;
  openChannel: (c: LiveStream) => void;
  streamIdsByCategory?: Record<string, number[]>;
  countByCategoryId?: Record<string, number>;
  streamById?: Map<number, LiveStream>;
  /** Only needed for web search / category overlay — omit to avoid parent EPG re-renders. */
  nowPlayingMap?: Map<number, string>;
  searchQuery?: string;
  programTitleByStreamId?: Map<number, string>;
  reportNowPlaying?: (id: number) => (title: string | undefined) => void;
  isFavorite?: (id: number) => boolean;
  favorites?: Favorite[];
};

/**
 * Memoized shell so Live TV shelf browse does not re-render when unrelated
 * parent state (EPG map, category grid, discovery) updates.
 */
function liveAllCategoriesBrowseEqual(
  prev: LiveAllCategoriesBrowseProps,
  next: LiveAllCategoriesBrowseProps
): boolean {
  if (prev.variant !== next.variant) return false;
  if (prev.categories !== next.categories) return false;
  if (prev.streams !== next.streams) return false;
  if (prev.streamById !== next.streamById) return false;
  if (prev.streamIdsByCategory !== next.streamIdsByCategory) return false;
  if (prev.countByCategoryId !== next.countByCategoryId) return false;
  if (prev.creds !== next.creds) return false;
  if (prev.openChannel !== next.openChannel) return false;
  if (prev.searchQuery !== next.searchQuery) return false;
  if (prev.favorites !== next.favorites) return false;
  if (prev.isFavorite !== next.isFavorite) return false;
  if (prev.reportNowPlaying !== next.reportNowPlaying) return false;
  if (prev.searchQuery && prev.nowPlayingMap !== next.nowPlayingMap) return false;
  if (prev.searchQuery && prev.programTitleByStreamId !== next.programTitleByStreamId) {
    return false;
  }
  return true;
}

export const LiveAllCategoriesBrowse = memo(function LiveAllCategoriesBrowse({
  variant,
  categories,
  streams,
  creds,
  openChannel,
  streamIdsByCategory,
  countByCategoryId,
  streamById,
  nowPlayingMap,
  searchQuery = "",
  programTitleByStreamId,
  reportNowPlaying,
  isFavorite,
  favorites = [],
}: LiveAllCategoriesBrowseProps) {
  if (variant === "tv") {
    return (
      <TvLiveBrowse
        categories={categories}
        streams={streams}
        streamById={streamById}
        streamIdsByCategory={streamIdsByCategory}
        countByCategoryId={countByCategoryId}
        loading={false}
        creds={creds}
        openChannel={openChannel}
        isFavorite={isFavorite ?? (() => false)}
        favorites={favorites}
        nowPlayingMap={nowPlayingMap ?? EMPTY_NOW_PLAYING}
        reportNowPlaying={reportNowPlaying}
      />
    );
  }

  return (
    <WebLiveBrowse
      categories={categories}
      streams={streams}
      streamById={streamById}
      streamIdsByCategory={streamIdsByCategory}
      countByCategoryId={countByCategoryId}
      creds={creds}
      openChannel={openChannel}
      nowPlayingMap={nowPlayingMap}
      searchQuery={searchQuery}
      programTitleByStreamId={programTitleByStreamId}
    />
  );
}, liveAllCategoriesBrowseEqual);
