"use client";

import { TvCategoryGrid } from "@/components/tv/TvCategoryGrid";
import { TvFocusRoot } from "@/components/tv/TvFocusRoot";
import { TvRegionBar } from "@/components/tv/TvRegionBar";
import { TvSimpleChannelList } from "@/components/tv/TvSimpleChannelList";
import type { LivePageShell } from "@/hooks/use-live-page-shell";
import {
  coerceTvRegion,
  detectRegionFromTimezone,
  type TvRegion,
} from "@/lib/geo-continent";
import { liveCategoryChannelsQueryOptions } from "@/lib/live-catalog-channels";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
} from "@/lib/live-flip-playlist";
import {
  filterLiveCategoriesForTvRegion,
  TV_SIMPLE_CATEGORY_BATCH,
  TV_SIMPLE_CHANNEL_BATCH,
} from "@/lib/tv-simple-browse";
import type { LiveStream } from "@/lib/xtream-types";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { looksAdult } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

type TvSimpleLiveBrowseProps = {
  shell: LivePageShell;
};

/**
 * Lightweight live TV for TV browsers — region filter, category pick, compact channel list.
 */
export function TvSimpleLiveBrowse({ shell }: TvSimpleLiveBrowseProps) {
  const { creds, sortedFilteredCats, countById, hideAdult, parentalUnlocked } =
    shell;
  const { play } = usePlayer();
  const addRecent = usePrefs((s) => s.addRecent);
  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const setStoredRegion = usePrefs((s) => s.setTvRegionFilter);

  const region: TvRegion =
    coerceTvRegion(storedRegion) ?? detectRegionFromTimezone();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(
    TV_SIMPLE_CATEGORY_BATCH
  );
  const [visibleChannelCount, setVisibleChannelCount] = useState(
    TV_SIMPLE_CHANNEL_BATCH
  );

  const regionCategories = useMemo(
    () => filterLiveCategoriesForTvRegion(sortedFilteredCats, region),
    [sortedFilteredCats, region]
  );

  const visibleCategories = useMemo(
    () => regionCategories.slice(0, visibleCategoryCount),
    [regionCategories, visibleCategoryCount]
  );

  const categoryItems = useMemo(
    () =>
      visibleCategories.map((c) => ({
        id: String(c.category_id),
        label: c.category_name,
        count: countById[String(c.category_id)],
      })),
    [visibleCategories, countById]
  );

  const selectedName = useMemo(() => {
    if (!categoryId) return "";
    return (
      regionCategories.find((c) => String(c.category_id) === categoryId)
        ?.category_name ?? "Channels"
    );
  }, [categoryId, regionCategories]);

  const channelsQuery = useQuery(
    liveCategoryChannelsQueryOptions(
      creds,
      categoryId ?? "all",
      TV_SIMPLE_CHANNEL_BATCH * 4,
      categoryId != null,
      region
    )
  );

  const channels = useMemo(() => {
    const list = channelsQuery.data ?? [];
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter(
      (c) => !looksAdult({ name: c.name, is_adult: c.is_adult })
    );
  }, [channelsQuery.data, hideAdult, parentalUnlocked]);

  const visibleChannels = useMemo(
    () => channels.slice(0, visibleChannelCount),
    [channels, visibleChannelCount]
  );

  const channelById = useMemo(() => {
    const map = new Map<number, LiveStream>();
    for (const c of channels) map.set(c.stream_id, c);
    return map;
  }, [channels]);

  const openChannel = useCallback(
    (c: LiveStream) => {
      const playlist = buildLiveFlipPlaylist(
        creds,
        visibleChannels.slice(0, 48)
      );
      play(liveStreamToPlayerSource(creds, c), { playlist });
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
    [play, addRecent, creds, visibleChannels]
  );

  const onRegionChange = useCallback(
    (next: TvRegion) => {
      setStoredRegion(next);
      setCategoryId(null);
      setVisibleCategoryCount(TV_SIMPLE_CATEGORY_BATCH);
      setVisibleChannelCount(TV_SIMPLE_CHANNEL_BATCH);
    },
    [setStoredRegion]
  );

  const pickCategory = useCallback((id: string) => {
    setCategoryId(id);
    setVisibleChannelCount(TV_SIMPLE_CHANNEL_BATCH);
  }, []);

  if (shell.catalog.isLoading && !shell.catalog.isFetched) {
    return (
      <div className="tv-simple-browse__loading">
        <Loader2 className="size-8 animate-spin text-(--brand)" aria-hidden />
        <p>Loading live TV…</p>
      </div>
    );
  }

  if (categoryId == null) {
    return (
      <TvFocusRoot className="tv-simple-browse">
        <TvRegionBar region={region} onChange={onRegionChange} />
        <p className="tv-simple-browse__lead">
          {region === "All" ? "Choose a category" : `Categories in ${region}`}
        </p>
        {regionCategories.length === 0 ? (
          <p className="tv-simple-browse__empty">
            No categories for this region. Try another region above.
          </p>
        ) : (
          <>
            <TvCategoryGrid items={categoryItems} onSelect={pickCategory} />
            {regionCategories.length > visibleCategoryCount ? (
              <button
                type="button"
                data-tv-card-root
                className="tv-simple-browse__more focus-ring"
                onClick={() =>
                  setVisibleCategoryCount((n) => n + TV_SIMPLE_CATEGORY_BATCH)
                }
              >
                Show more categories ({visibleCategoryCount} of{" "}
                {regionCategories.length})
              </button>
            ) : null}
          </>
        )}
      </TvFocusRoot>
    );
  }

  return (
    <TvFocusRoot className="tv-simple-browse" autoFocus>
      <button
        type="button"
        data-tv-card-root
        className="tv-simple-browse__back focus-ring"
        onClick={() => {
          setCategoryId(null);
          setVisibleChannelCount(TV_SIMPLE_CHANNEL_BATCH);
        }}
      >
        <ArrowLeft className="size-5 shrink-0" aria-hidden />
        <span>{selectedName}</span>
      </button>

      {channelsQuery.isLoading ? (
        <div className="tv-simple-browse__loading">
          <Loader2 className="size-8 animate-spin text-(--brand)" aria-hidden />
          <p>Loading channels…</p>
        </div>
      ) : channels.length === 0 ? (
        <p className="tv-simple-browse__empty">No channels in this category.</p>
      ) : (
        <>
          <p className="tv-simple-browse__count">
            Showing {visibleChannels.length} of {channels.length} channels
          </p>
          <TvSimpleChannelList
            channels={visibleChannels.map((c) => ({
              id: c.stream_id,
              name: c.name,
              icon: c.stream_icon,
              panelServer: creds.server,
            }))}
            onSelect={(id) => {
              const ch = channelById.get(id);
              if (ch) openChannel(ch);
            }}
          />
          {channels.length > visibleChannelCount ? (
            <button
              type="button"
              data-tv-card-root
              className="tv-simple-browse__more focus-ring"
              onClick={() =>
                setVisibleChannelCount((n) => n + TV_SIMPLE_CHANNEL_BATCH)
              }
            >
              Show more channels
            </button>
          ) : null}
        </>
      )}
    </TvFocusRoot>
  );
}
