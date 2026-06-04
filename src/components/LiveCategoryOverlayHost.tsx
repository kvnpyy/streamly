"use client";

import { TvCategoryView } from "@/components/TvCategoryView";
import { useLiveOpenCategory } from "@/hooks/use-live-open-category";
import { useShelfNowPlayingMap } from "@/hooks/use-shelf-now-playing";
import { liveCategoryChannelsQueryOptions } from "@/lib/live-catalog-channels";
import { LIVE_LIST_MAX_CHANNELS } from "@/lib/live-guide-limits";
import { openLiveCategoryChannel } from "@/lib/open-live-shelf-channel";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import type { LiveStream } from "@/lib/xtream-types";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { LIVE_PAGE_PATH } from "@/lib/use-live-page-search";

/**
 * Renders the full-screen category channel list at the app shell level so it
 * survives browse unmount during playback and reappears as soon as the player
 * closes (without waiting for shelf rows to rebuild).
 */
export function LiveCategoryOverlayHost() {
  const pathname = usePathname();
  const creds = useAuth((s) => s.creds);
  const playerOpen = usePlayer((s) => s.open);
  const activeStreamId = usePlayer((s) => s.current?.id);
  const addRecent = usePrefs((s) => s.addRecent);
  const { openCategoryId, openCategoryTitle, closeCategory } =
    useLiveOpenCategory();

  const isLivePage = pathname === LIVE_PAGE_PATH;

  useEffect(() => {
    if (!isLivePage) closeCategory();
  }, [isLivePage, closeCategory]);

  const openCategoryFetched = useQuery(
    liveCategoryChannelsQueryOptions(
      creds!,
      openCategoryId ?? "all",
      LIVE_LIST_MAX_CHANNELS,
      Boolean(creds && openCategoryId)
    )
  );

  const openCategoryChannels = useDeferredValue(
    openCategoryFetched.data ?? []
  );

  const categoryNameById = useMemo(() => {
    if (!openCategoryId || !openCategoryTitle) return {};
    return { [openCategoryId]: openCategoryTitle };
  }, [openCategoryId, openCategoryTitle]);

  const shelfEpgChannels = useMemo(
    () =>
      openCategoryChannels.map((c) => ({
        stream_id: c.stream_id,
        name: c.name,
        category_id: c.category_id,
      })),
    [openCategoryChannels]
  );

  const nowPlayingMap = useShelfNowPlayingMap(
    creds!,
    shelfEpgChannels,
    categoryNameById,
    Boolean(creds && openCategoryId && !playerOpen && shelfEpgChannels.length > 0),
    Math.min(shelfEpgChannels.length, 96)
  );

  const onPlay = useCallback(
    (c: LiveStream) => {
      if (!creds) return;
      openLiveCategoryChannel(creds, c, openCategoryChannels);
      addRecent({
        kind: "live",
        id: c.stream_id,
        name: c.name,
        icon: c.stream_icon,
        ...(c.direct_source?.trim()
          ? { meta: { direct_source: c.direct_source.trim() } }
          : {}),
      });
    },
    [addRecent, creds, openCategoryChannels]
  );

  if (!creds || !isLivePage || playerOpen || !openCategoryId) {
    return null;
  }

  const title = openCategoryTitle ?? "Category";

  return (
    <TvCategoryView
      title={title}
      categoryTitle={title}
      channels={openCategoryChannels}
      nowPlayingMap={nowPlayingMap}
      activeStreamId={activeStreamId}
      creds={creds}
      onPlay={onPlay}
      onBack={closeCategory}
    />
  );
}
