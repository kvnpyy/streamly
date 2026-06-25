"use client";

import { TvCategoryGrid } from "@/components/tv/TvCategoryGrid";
import { TvChannelCard } from "@/components/TvChannelCard";
import { TvFocusRoot } from "@/components/tv/TvFocusRoot";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import type { LivePageShell } from "@/hooks/use-live-page-shell";
import { liveCategoryChannelsQueryOptions } from "@/lib/live-catalog-channels";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
} from "@/lib/live-flip-playlist";
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
 * Lightweight live TV for TV browsers — pick a category, then channels.
 * No EPG scans, trending shelves, or programme search.
 */
export function TvSimpleLiveBrowse({ shell }: TvSimpleLiveBrowseProps) {
  const { creds, sortedFilteredCats, countById, hideAdult, parentalUnlocked } =
    shell;
  const { play } = usePlayer();
  const addRecent = usePrefs((s) => s.addRecent);

  const [categoryId, setCategoryId] = useState<string | null>(null);

  const categoryItems = useMemo(
    () =>
      sortedFilteredCats.map((c) => ({
        id: String(c.category_id),
        label: c.category_name,
        count: countById[String(c.category_id)],
      })),
    [sortedFilteredCats, countById]
  );

  const selectedName = useMemo(() => {
    if (!categoryId) return "";
    return (
      sortedFilteredCats.find((c) => String(c.category_id) === categoryId)
        ?.category_name ?? "Channels"
    );
  }, [categoryId, sortedFilteredCats]);

  const channelsQuery = useQuery(
    liveCategoryChannelsQueryOptions(
      creds,
      categoryId ?? "all",
      120,
      categoryId != null
    )
  );

  const channels = useMemo(() => {
    const list = channelsQuery.data ?? [];
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter(
      (c) => !looksAdult({ name: c.name, is_adult: c.is_adult })
    );
  }, [channelsQuery.data, hideAdult, parentalUnlocked]);

  const openChannel = useCallback(
    (c: LiveStream) => {
      const playlist = buildLiveFlipPlaylist(creds, channels.slice(0, 48));
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
    [play, addRecent, creds, channels]
  );

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
        <p className="tv-simple-browse__lead">Choose a category</p>
        <TvCategoryGrid items={categoryItems} onSelect={setCategoryId} />
      </TvFocusRoot>
    );
  }

  return (
    <TvFocusRoot className="tv-simple-browse" autoFocus>
      <button
        type="button"
        data-tv-card-root
        className="tv-simple-browse__back focus-ring"
        onClick={() => setCategoryId(null)}
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
        <TvSpatialGrid className="tv-simple-browse__grid">
          {channels.map((c) => (
            <div key={c.stream_id} className="tv-simple-browse__channel">
              <TvChannelCard
                variant="web"
                name={c.name}
                icon={c.stream_icon}
                panelServer={creds.server}
                onClick={() => openChannel(c)}
              />
            </div>
          ))}
        </TvSpatialGrid>
      )}
    </TvFocusRoot>
  );
}
