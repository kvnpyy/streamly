"use client";

import { ChannelTile } from "@/components/ChannelTile";
import { VirtualChannelTileGrid } from "@/components/VirtualChannelTileGrid";
import { TvSearchPanel } from "@/components/TvSearchPanel";
import { MediaCard } from "@/components/MediaCard";
import { VirtualMediaCatalogGrid } from "@/components/VirtualMediaCatalogGrid";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { useCatalogPlay } from "@/hooks/use-catalog-play";
import { useGlobalProgrammeSearch } from "@/hooks/use-global-programme-search";
import { liveCatalogQueryOptions } from "@/lib/live-catalog-query";
import { seriesCatalogQueryOptions } from "@/lib/series-catalog-query";
import { vodCatalogQueryOptions } from "@/lib/vod-catalog-query";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import {
  buildLiveChannelIndex,
  filterLiveChannelsByName,
} from "@/lib/live-channel-index";
import {
  buildNameSearchIndex,
  filterByNameQuery,
} from "@/lib/name-search-index";
import { looksAdult, parsePositiveRouteId } from "@/lib/utils";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
} from "@/lib/live-flip-playlist";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useMemo, useRef } from "react";

const MIN_SEARCH_LEN = 2;
const MAX_PER_SECTION = 48;

function SearchInner() {
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const tv = useTvBrowser();
  const slashRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(slashRef);

  const creds = useAuth((s) => s.creds)!;
  const { play } = usePlayer();
  const { playMovie, movieDetailHref, seriesDetailHref } = useCatalogPlay();
  const { isFavorite, toggleFavorite, addRecent, hideAdult, parentalUnlocked } =
    usePrefs();
  const safe = hideAdult && !parentalUnlocked;

  const f = q.trim().toLowerCase();
  const searchEnabled = f.length >= MIN_SEARCH_LEN;

  const liveCatalog = useQuery({
    ...liveCatalogQueryOptions(creds),
    enabled: searchEnabled,
  });
  const vod = useQuery({
    ...vodCatalogQueryOptions(creds, searchEnabled),
  });
  const series = useQuery({
    ...seriesCatalogQueryOptions(creds, searchEnabled),
  });

  const liveChannelIndex = useMemo(() => {
    const rows = liveCatalog.data?.streams;
    if (!searchEnabled || !rows?.length) return null;
    return buildLiveChannelIndex(rows);
  }, [liveCatalog.data?.streams, searchEnabled]);

  const filteredLiveByName = useMemo(() => {
    if (!searchEnabled || !liveChannelIndex) return [];
    const matched = filterLiveChannelsByName(liveChannelIndex, f);
    const out: typeof matched = [];
    for (const s of matched) {
      if (out.length >= MAX_PER_SECTION) break;
      if (safe && looksAdult({ name: s.name, is_adult: s.is_adult })) continue;
      out.push(s);
    }
    return out;
  }, [liveChannelIndex, f, safe, searchEnabled]);

  const { liveMatches, programmeScanning } = useGlobalProgrammeSearch(
    creds,
    f,
    filteredLiveByName,
    liveChannelIndex,
    searchEnabled
  );

  const filteredLive = useMemo(() => {
    if (!searchEnabled) return [];
    return liveMatches.slice(0, MAX_PER_SECTION);
  }, [liveMatches, searchEnabled]);

  const vodNameIndex = useMemo(() => {
    const rows = vod.data?.streams;
    if (!searchEnabled || !rows?.length) return null;
    return buildNameSearchIndex(rows, (s) => s.name);
  }, [vod.data?.streams, searchEnabled]);

  const seriesNameIndex = useMemo(() => {
    const rows = series.data?.streams;
    if (!searchEnabled || !rows?.length) return null;
    return buildNameSearchIndex(rows, (s) => s.name);
  }, [series.data?.streams, searchEnabled]);

  const filteredVod = useMemo(() => {
    if (!searchEnabled || !vodNameIndex) return [];
    const matched = filterByNameQuery(vodNameIndex, f);
    const out: typeof matched = [];
    for (const s of matched) {
      if (parsePositiveRouteId(s.stream_id) == null) continue;
      if (safe && looksAdult({ name: s.name, is_adult: s.is_adult })) continue;
      out.push(s);
      if (out.length >= MAX_PER_SECTION) break;
    }
    return out;
  }, [vodNameIndex, f, safe, searchEnabled]);

  const filteredSeries = useMemo(() => {
    if (!searchEnabled || !seriesNameIndex) return [];
    const matched = filterByNameQuery(seriesNameIndex, f);
    const out: typeof matched = [];
    for (const s of matched) {
      if (parsePositiveRouteId(s.series_id) == null) continue;
      if (safe && looksAdult({ name: s.name })) continue;
      out.push(s);
      if (out.length >= MAX_PER_SECTION) break;
    }
    return out;
  }, [seriesNameIndex, f, safe, searchEnabled]);

  const deferredLive = useDeferredValue(filteredLive);
  const deferredVod = useDeferredValue(filteredVod);
  const deferredSeries = useDeferredValue(filteredSeries);

  const catalogLoading =
    searchEnabled &&
    (liveCatalog.isFetching || vod.isFetching || series.isFetching);

  const loading = catalogLoading && deferredLive.length + deferredVod.length + deferredSeries.length === 0;

  const total =
    deferredLive.length + deferredVod.length + deferredSeries.length;

  return (
    <div className="space-y-3 sm:space-y-5">
      <SectionHeader
        compact
        hideDescriptionOnMobile
        eyebrow="Find anything"
        title="Search"
        description={
          tv
            ? "Type below with your remote — matches appear as you search."
            : "Use the bar at the top — results update as you type. Channels, on-air programmes, movies, and series."
        }
      />

      {tv ? <TvSearchPanel className="scroll-mt-4" /> : null}

      {!f ? (
        <div className="rounded-xl border border-(--line) bg-(--bg-2)/80 px-4 py-6 sm:py-8 text-center text-sm text-(--text-muted)">
          {tv
            ? "Enter a title in the search box above to see matches here."
            : "Type in the search bar at the top of the screen to see matches here."}
        </div>
      ) : f.length < MIN_SEARCH_LEN ? (
        <div className="rounded-xl border border-(--line) bg-(--bg-2)/80 px-4 py-6 text-center text-sm text-(--text-muted)">
          Type at least {MIN_SEARCH_LEN} characters to search the catalog.
        </div>
      ) : loading ? (
        <div className="space-y-8" aria-busy="true">
          <section>
            <div className="skeleton h-4 w-24 rounded mb-3" />
            <SkeletonGrid count={8} variant="tile" />
          </section>
          <section>
            <div className="skeleton h-4 w-24 rounded mb-3" />
            <SkeletonGrid count={12} />
          </section>
        </div>
      ) : total === 0 && !programmeScanning ? (
        <div className="rounded-xl border border-(--line) bg-(--bg-2)/80 px-4 py-6 sm:py-8 text-center text-sm text-(--text-muted)">
          No results for “{q}”.
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8 scroll-mt-4">
          {(deferredLive.length > 0 || programmeScanning) && (
            <section aria-busy={programmeScanning}>
              <h3 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
                Live ({deferredLive.length}
                {programmeScanning ? "+" : ""})
                {programmeScanning ? (
                  <span className="normal-case tracking-normal text-(--text-dim) ml-2">
                    scanning programmes…
                  </span>
                ) : null}
              </h3>
              {deferredLive.length > 0 ? (
                <VirtualChannelTileGrid
                  items={deferredLive}
                  itemKey={(c) => c.stream_id}
                  renderItem={(c) => (
                    <ChannelTile
                      number={c.num}
                      name={c.name}
                      icon={c.stream_icon}
                      isFavorite={isFavorite("live", c.stream_id)}
                      onToggleFavorite={() =>
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
                      onClick={() => {
                        play(liveStreamToPlayerSource(creds, c), {
                          playlist: buildLiveFlipPlaylist(creds, deferredLive),
                        });
                        addRecent({
                          kind: "live",
                          id: c.stream_id,
                          name: c.name,
                          icon: c.stream_icon,
                          ...(c.direct_source?.trim()
                            ? { meta: { direct_source: c.direct_source.trim() } }
                            : {}),
                        });
                      }}
                    />
                  )}
                />
              ) : (
                <SkeletonGrid count={6} variant="tile" />
              )}
            </section>
          )}

          {deferredVod.length > 0 && (
            <section>
              <h3 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
                Movies ({deferredVod.length})
              </h3>
              <VirtualMediaCatalogGrid
                items={deferredVod}
                maxItems={MAX_PER_SECTION}
                revision={f}
                renderItem={(m) => {
                  const href = movieDetailHref(m);
                  return (
                    <MediaCard
                      onClick={() => playMovie(m)}
                      detailHref={href}
                      poster={m.stream_icon}
                      title={m.name}
                      subtitle={m.year}
                      rating={m.rating}
                      isFavorite={isFavorite("movie", m.stream_id)}
                      onToggleFavorite={() =>
                        toggleFavorite({
                          kind: "movie",
                          id: m.stream_id,
                          name: m.name,
                          icon: m.stream_icon,
                        })
                      }
                    />
                  );
                }}
                itemKey={(m) => parsePositiveRouteId(m.stream_id) ?? m.stream_id}
              />
            </section>
          )}

          {deferredSeries.length > 0 && (
            <section>
              <h3 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
                Series ({deferredSeries.length})
              </h3>
              <VirtualMediaCatalogGrid
                items={deferredSeries}
                maxItems={MAX_PER_SECTION}
                revision={f}
                renderItem={(s) => {
                  const sid = parsePositiveRouteId(s.series_id)!;
                  const href = seriesDetailHref(s);
                  return (
                    <MediaCard
                      href={href ?? `/app/series/${sid}`}
                      poster={s.cover}
                      title={s.name}
                      subtitle={s.year}
                      rating={s.rating}
                      isFavorite={isFavorite("series", sid)}
                      onToggleFavorite={() =>
                        toggleFavorite({
                          kind: "series",
                          id: sid,
                          name: s.name,
                          icon: s.cover,
                        })
                      }
                    />
                  );
                }}
                itemKey={(s) => parsePositiveRouteId(s.series_id) ?? s.series_id}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-(--text-muted) text-sm">Loading…</div>}>
      <SearchInner />
    </Suspense>
  );
}
