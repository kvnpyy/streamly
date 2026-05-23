"use client";

import { ChannelTile } from "@/components/ChannelTile";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { MediaCard } from "@/components/MediaCard";
import { SectionHeader } from "@/components/SectionHeader";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import { looksAdult, parsePositiveRouteId, safeLower } from "@/lib/utils";
import { buildLivePlayUrl, xtream } from "@/lib/xtream";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef } from "react";

function SearchInner() {
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const slashRef = useRef<HTMLInputElement>(null);
  /** `/` focuses the sticky bar field via {@link useSlashFocusSearch} fallback id. */
  useSlashFocusSearch(slashRef);

  const creds = useAuth((s) => s.creds)!;
  const { play } = usePlayer();
  const { isFavorite, toggleFavorite, addRecent, hideAdult, parentalUnlocked } =
    usePrefs();
  const safe = hideAdult && !parentalUnlocked;

  const live = useQuery({
    queryKey: ["live", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.liveStreamsAll(creds, { signal }),
  });
  const vod = useQuery({
    queryKey: ["vod", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.vodStreams(creds, undefined, signal),
  });
  const series = useQuery({
    queryKey: ["series", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.series(creds, undefined, signal),
  });

  const f = q.trim().toLowerCase();
  const filteredLive = useMemo(
    () =>
      f
        ? (live.data || [])
            .filter((s) => safeLower(s.name).includes(f))
            .filter((s) => !safe || !looksAdult({ name: s.name, is_adult: s.is_adult }))
            .slice(0, 60)
        : [],
    [live.data, f, safe]
  );
  const filteredVod = useMemo(
    () =>
      f
        ? (vod.data || [])
            .filter((s) => parsePositiveRouteId(s.stream_id) != null)
            .filter((s) => safeLower(s.name).includes(f))
            .filter((s) => !safe || !looksAdult({ name: s.name, is_adult: s.is_adult }))
            .slice(0, 60)
        : [],
    [vod.data, f, safe]
  );
  const filteredSeries = useMemo(
    () =>
      f
        ? (series.data || [])
            .filter((s) => parsePositiveRouteId(s.series_id) != null)
            .filter((s) => safeLower(s.name).includes(f))
            .filter((s) => !safe || !looksAdult({ name: s.name }))
            .slice(0, 60)
        : [],
    [series.data, f, safe]
  );

  const total = filteredLive.length + filteredVod.length + filteredSeries.length;

  return (
    <div className="space-y-3 sm:space-y-5">
      <SectionHeader
        compact
        hideDescriptionOnMobile
        eyebrow="Find anything"
        title="Search"
        description="Use the bar at the top — results update as you type. Live channels, movies, and series all at once."
      />
      {!f ? (
        <div className="rounded-xl border border-(--line) bg-(--bg-2)/80 px-4 py-6 sm:py-8 text-center text-sm text-(--text-muted)">
          Type in the search bar above to see matches here.
        </div>
      ) : total === 0 ? (
        <div className="rounded-xl border border-(--line) bg-(--bg-2)/80 px-4 py-6 sm:py-8 text-center text-sm text-(--text-muted)">
          No results for “{q}”.
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8 scroll-mt-4">
          {filteredLive.length > 0 && (
            <section>
              <h3 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
                Live ({filteredLive.length})
              </h3>
              <TvSpatialGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredLive.map((c) => (
                  <ChannelTile
                    key={c.stream_id}
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
                      play({
                        kind: "live",
                        id: c.stream_id,
                        title: c.name,
                        poster: c.stream_icon,
                        url: buildLivePlayUrl(creds, c),
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
                ))}
              </TvSpatialGrid>
            </section>
          )}

          {filteredVod.length > 0 && (
            <section>
              <h3 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
                Movies ({filteredVod.length})
              </h3>
              <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredVod.map((m) => {
                  const mid = parsePositiveRouteId(m.stream_id)!;
                  return (
                  <MediaCard
                    key={mid}
                    href={`/app/movies/${mid}`}
                    poster={m.stream_icon}
                    title={m.name}
                    subtitle={m.year}
                    rating={m.rating}
                    isFavorite={isFavorite("movie", mid)}
                    onToggleFavorite={() =>
                      toggleFavorite({
                        kind: "movie",
                        id: mid,
                        name: m.name,
                        icon: m.stream_icon,
                      })
                    }
                  />
                  );
                })}
              </TvSpatialGrid>
            </section>
          )}

          {filteredSeries.length > 0 && (
            <section>
              <h3 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
                Series ({filteredSeries.length})
              </h3>
              <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredSeries.map((s) => {
                  const sid = parsePositiveRouteId(s.series_id)!;
                  return (
                  <MediaCard
                    key={sid}
                    href={`/app/series/${sid}`}
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
                })}
              </TvSpatialGrid>
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
