"use client";

import { ActiveCategoryFilterBar } from "@/components/ActiveCategoryFilterBar";
import { VirtualMediaCatalogGrid } from "@/components/VirtualMediaCatalogGrid";
import { DiscoveryShelf } from "@/components/DiscoveryShelf";
import { MediaShelf } from "@/components/MediaShelf";
import { useCatalogPageReady } from "@/hooks/use-catalog-page-ready";
import { useCatalogPlay } from "@/hooks/use-catalog-play";
import { useMovieDiscoveryShelves } from "@/hooks/use-vod-discovery-shelves";
import { isDiscoveryShelvesEnabled } from "@/lib/discovery";
import { VodGenreBar } from "@/components/VodGenreBar";
import { MediaCard } from "@/components/MediaCard";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { buildProviderGenreShelves } from "@/lib/vod-genre-discovery";
import { parsePositiveRouteId } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import {
  buildNameSearchIndex,
  filterByNameQuery,
} from "@/lib/name-search-index";
import { looksAdult, safeStr } from "@/lib/utils";
import { vodCatalogQueryOptions } from "@/lib/vod-catalog-query";
import type { VodStream, XtreamCredentials } from "@/lib/xtream-types";
import { useAuth } from "@/store/auth";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import {
  CatalogSortToggle,
  catalogSortLabel,
  type CatalogSort,
} from "@/components/CatalogSortToggle";
import { shouldUseInstantCatalogGrid } from "@/lib/catalog-sort";
import { useTvPresentation } from "@/lib/use-living-room-home-layout";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import {
  buildIdsByCategory,
  buildItemByIdMap,
  countByCategoryFromIndex,
  pickItemsForCategory,
} from "@/lib/vod-catalog-index";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

export default function MoviesPage() {
  const creds = useAuth((s) => s.creds)!;
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);
  return (
    <MoviesPageInner key={accountKey} creds={creds} accountKey={accountKey} />
  );
}

function MoviesPageInner({
  creds,
  accountKey,
}: {
  creds: XtreamCredentials;
  accountKey: string;
}) {
  const {
    isFavorite,
    toggleFavorite,
    hideAdult,
    parentalUnlocked,
    setBrowsePref,
    recents,
    favorites,
  } = usePrefs();
  const { playMovie, movieDetailHref, enrichMovieShelfItems } = useCatalogPlay();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [categoryOverride, setCategoryOverride] = useState<
    string | "all" | null
  >(null);
  const [qInput, setQInput] = useState("");
  const moviesSearchRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(moviesSearchRef);
  const qFilter = useDebouncedValue(qInput, 140);
  const [sort, setSort] = useState<CatalogSort>("added");
  const catalogGridRef = useRef<HTMLDivElement>(null);

  const savedMoviesCategory = usePrefs(
    (s) => s.browseByAccount[accountKey]?.moviesCategory
  );

  const prefsCategory: string | "all" =
    savedMoviesCategory === undefined
      ? "all"
      : savedMoviesCategory === "all"
        ? "all"
        : String(savedMoviesCategory);

  const [, startCategorySwitch] = useTransition();

  const setCategory = useCallback(
    (v: string | "all") => {
      startCategorySwitch(() => {
        const next = v === "all" ? "all" : String(v);
        setCategoryOverride(next);
        setBrowsePref(accountKey, { moviesCategory: next });
        const params = new URLSearchParams(searchParams.toString());
        if (next === "all") params.delete("category");
        else params.set("category", next);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [accountKey, setBrowsePref, searchParams, pathname, router, startCategorySwitch]
  );

  const catalogReady = useCatalogPageReady();
  const catalog = useQuery(vodCatalogQueryOptions(creds, catalogReady));

  const cats = useMemo(
    () => ({
      data: catalog.data?.categories,
      isLoading: !catalogReady || catalog.isLoading,
      isError: catalog.isError,
      isFetched: catalog.isFetched,
    }),
    [
      catalog.data?.categories,
      catalogReady,
      catalog.isLoading,
      catalog.isError,
      catalog.isFetched,
    ]
  );

  const movies = useMemo(
    () => ({
      data: catalog.data?.streams,
      isLoading: !catalogReady || catalog.isLoading,
      isError: catalog.isError,
      isFetched: catalog.isFetched,
    }),
    [
      catalog.data?.streams,
      catalogReady,
      catalog.isLoading,
      catalog.isError,
      catalog.isFetched,
    ]
  );

  const filteredCats = useMemo(() => {
    const list = cats.data || [];
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter((c) => !looksAdult({ category_name: c.category_name }));
  }, [cats.data, hideAdult, parentalUnlocked]);

  const allowedCatIds = useMemo(
    () => new Set(filteredCats.map((c) => String(c.category_id))),
    [filteredCats]
  );

  const fromUrlCategory = useMemo(() => {
    const fromUrl = searchParams.get("category");
    if (!fromUrl || fromUrl === "all") return null;
    if (!allowedCatIds.has(fromUrl)) return null;
    return fromUrl;
  }, [searchParams, allowedCatIds]);

  const selectedBase = categoryOverride ?? fromUrlCategory ?? prefsCategory;

  const selected =
    selectedBase !== "all" &&
    filteredCats.length > 0 &&
    !allowedCatIds.has(String(selectedBase))
      ? "all"
      : selectedBase;

  useEffect(() => {
    if (selectedBase === selected) return;
    setBrowsePref(accountKey, { moviesCategory: "all" });
    queueMicrotask(() => setCategoryOverride(null));
  }, [selectedBase, selected, accountKey, setBrowsePref]);

  useEffect(() => {
    if (!fromUrlCategory) return;
    queueMicrotask(() => {
      setBrowsePref(accountKey, { moviesCategory: fromUrlCategory });
    });
  }, [fromUrlCategory, accountKey, setBrowsePref]);

  const vodCatalog = useMemo(() => {
    const raw = movies.data || [];
    if (!raw.length) {
      return {
        filtered: [] as VodStream[],
        byId: undefined as Map<number, VodStream> | undefined,
        idsByCategory: undefined as Record<string, number[]> | undefined,
        countById: {} as Record<string, number>,
      };
    }
    let filtered = raw;
    if (hideAdult && !parentalUnlocked) {
      filtered = filtered.filter(
        (s) =>
          allowedCatIds.has(String(s.category_id)) &&
          !looksAdult({ name: s.name, is_adult: s.is_adult })
      );
    }
    const byId = buildItemByIdMap(filtered, (s) => s.stream_id);
    const serverIndex = catalog.data?.idsByCategory;
    const serverCounts = catalog.data?.countByCategoryId;
    if (serverIndex && serverCounts) {
      return {
        filtered,
        byId,
        idsByCategory: serverIndex,
        countById: serverCounts,
      };
    }
    const idsByCategory = buildIdsByCategory(
      filtered,
      (s) => String(s.category_id),
      (s) => s.stream_id
    );
    return {
      filtered,
      byId,
      idsByCategory,
      countById: countByCategoryFromIndex(idsByCategory),
    };
  }, [catalog.data, movies.data, hideAdult, parentalUnlocked, allowedCatIds]);

  const countById = vodCatalog.countById;

  const categoryStreams = useMemo(
    () =>
      selected === "all"
        ? vodCatalog.filtered
        : pickItemsForCategory(
            vodCatalog.filtered,
            selected,
            vodCatalog.idsByCategory,
            vodCatalog.byId
          ),
    [vodCatalog, selected]
  );

  const categoryNameIndex = useMemo(
    () => buildNameSearchIndex(categoryStreams, (s) => s.name),
    [categoryStreams]
  );

  const visible = useMemo(() => {
    let list = categoryStreams;
    const f = qFilter.trim().toLowerCase();
    if (f) list = filterByNameQuery(categoryNameIndex, f);
    if (sort === "rating" || sort === "name") {
      list = list.slice().sort((a, b) => {
        if (sort === "rating") {
          return (
            (parseFloat(b.rating || "0") || 0) - (parseFloat(a.rating || "0") || 0)
          );
        }
        return safeStr(a.name).localeCompare(safeStr(b.name));
      });
    }
    /* sort === "added": keep panel order (avoids O(n log n) on huge catalogs). */
    return list;
  }, [categoryStreams, categoryNameIndex, qFilter, sort]);

  // ── Discovery shelves ───────────────────────────────────────────────────

  /** Recently watched movies (from persisted recents store). */
  const recentMovieItems = useMemo(() => {
    const allMovies = movies.data ?? [];
    const movieById = new Map(
      allMovies.map((m) => [parsePositiveRouteId(m.stream_id), m])
    );
    return recents
      .filter((r) => r.kind === "movie")
      .slice(0, 20)
      .map((r) => {
        const mid = parsePositiveRouteId(r.id);
        if (mid == null) return null;
        const movie = movieById.get(mid);
        return {
          id: mid,
          href: `/app/movies/${mid}`,
          poster: movie?.stream_icon ?? r.icon,
          title: r.name,
          subtitle: movie?.year,
          rating: movie?.rating,
          isFavorite: isFavorite("movie", mid),
          onToggleFavorite: () =>
            toggleFavorite({ kind: "movie", id: mid, name: r.name, icon: r.icon }),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [recents, movies.data, isFavorite, toggleFavorite]);

  const toggleFavoriteMovie = useCallback(
    (m: VodStream, mid: number) => {
      toggleFavorite({ kind: "movie", id: mid, name: m.name, icon: m.stream_icon });
    },
    [toggleFavorite]
  );

  const discoveryOn = isDiscoveryShelvesEnabled();

  const [discoveryReady, setDiscoveryReady] = useState(false);
  useEffect(() => {
    if (selected !== "all" || qFilter || movies.isLoading || !discoveryOn) {
      queueMicrotask(() => setDiscoveryReady(false));
      return;
    }
    return scheduleWhenIdle(() => setDiscoveryReady(true), 2_500);
  }, [selected, qFilter, movies.isLoading, discoveryOn]);

  const discovery = useMovieDiscoveryShelves(
    discoveryReady ? movies.data : undefined,
    recents,
    favorites,
    {
      hideAdult,
      parentalUnlocked,
      isFavorite,
      toggleFavoriteMovie,
    }
  );

  const topRatedItems = useMemo(
    () => enrichMovieShelfItems(discovery.topRated, movies.data),
    [discovery.topRated, movies.data, enrichMovieShelfItems]
  );
  const newlyAddedItems = useMemo(
    () => enrichMovieShelfItems(discovery.newlyAdded, movies.data),
    [discovery.newlyAdded, movies.data, enrichMovieShelfItems]
  );
  const forYouItems = useMemo(
    () => enrichMovieShelfItems(discovery.forYou, movies.data),
    [discovery.forYou, movies.data, enrichMovieShelfItems]
  );
  const trendingItems = useMemo(
    () => enrichMovieShelfItems(discovery.trending, movies.data),
    [discovery.trending, movies.data, enrichMovieShelfItems]
  );
  const playableRecentMovies = useMemo(
    () => enrichMovieShelfItems(recentMovieItems, movies.data),
    [recentMovieItems, movies.data, enrichMovieShelfItems]
  );

  const genreShelves = useMemo(
    () =>
      discoveryReady
        ? buildProviderGenreShelves({
            kind: "movie",
            categories: filteredCats,
            countById,
            streams: movies.data ?? [],
            allowedCatIds,
            hideAdult,
            parentalUnlocked,
            isFavorite: (kind, id) => isFavorite(kind, id),
            toggleFavorite,
            maxShelves: 6,
          })
        : [],
    [
      discoveryReady,
      filteredCats,
      countById,
      movies.data,
      allowedCatIds,
      hideAdult,
      parentalUnlocked,
      isFavorite,
      toggleFavorite,
    ]
  );

  const showDiscovery =
    discoveryReady &&
    discoveryOn &&
    selected === "all" &&
    !qFilter &&
    sort === "added" &&
    !movies.isLoading;

  const tvPresentation = useTvPresentation();
  const tvShelfBrowse = tvPresentation && showDiscovery;

  const deferredVisible = useDeferredValue(visible);
  const displayVisible = shouldUseInstantCatalogGrid(sort, qFilter)
    ? visible
    : deferredVisible;

  const handleSortChange = useCallback((next: CatalogSort) => {
    setSort(next);
    if (next !== "added") {
      requestAnimationFrame(() => {
        catalogGridRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, []);

  const gridRevision = useMemo(
    () =>
      [
        showDiscovery ? "disc" : "grid",
        sort,
        recentMovieItems.length,
        topRatedItems.length,
        newlyAddedItems.length,
        genreShelves.map((s) => `${s.categoryId}:${s.items.length}`).join(","),
        selected,
        qFilter,
      ].join("|"),
    [
      showDiscovery,
      sort,
      recentMovieItems.length,
      topRatedItems.length,
      newlyAddedItems.length,
      genreShelves,
      selected,
      qFilter,
    ]
  );

  const sortLabel = catalogSortLabel(sort);

  const selectedCategoryName = useMemo(() => {
    if (selected === "all") return "";
    const sid = String(selected);
    return (
      filteredCats.find((c) => String(c.category_id) === sid)?.category_name ||
      ""
    );
  }, [selected, filteredCats]);

  const hideAdultGenres = hideAdult && !parentalUnlocked;

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-3">
            <SectionHeader
              compact
              hideDescriptionOnMobile
              eyebrow="On demand"
              title="Movies"
              description={
                selected === "all"
                  ? "Browse by genre or search the full catalog."
                  : `Movies in “${selectedCategoryName || "this category"}”.`
              }
              className="mb-0"
            />
            {!cats.isLoading && (
              <VodGenreBar
                categories={filteredCats}
                value={selected}
                onChange={setCategory}
                countById={countById}
                hideAdult={hideAdultGenres}
              />
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto shrink-0">
            <input
              ref={moviesSearchRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search movies…"
              aria-label="Search movies"
              className="h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) focus:border-(--brand)/50 outline-none text-sm w-full sm:w-56 min-w-0"
            />
            <CatalogSortToggle sort={sort} onChange={handleSortChange} />
          </div>
        </div>
      </header>

      {/* ── Discovery shelves (hidden when user has active filters) ── */}
      {showDiscovery && (
        <div className="space-y-6">
          {playableRecentMovies.length > 0 && (
            <MediaShelf
              eyebrow="Pick up where you left off"
              title="Continue Watching"
              items={playableRecentMovies}
            />
          )}
          {discoveryOn && forYouItems.length > 0 && (
            <DiscoveryShelf
              meta={discovery.meta.vod_for_you_movies}
              items={forYouItems}
            />
          )}
          {discoveryOn && trendingItems.length > 0 && (
            <DiscoveryShelf
              meta={discovery.meta.vod_trending_movies}
              items={trendingItems}
              loading={discovery.trendingLoading}
            />
          )}
          {topRatedItems.length > 0 && (
            <DiscoveryShelf
              meta={discovery.meta.vod_top_rated_movies}
              items={topRatedItems}
            />
          )}
          {newlyAddedItems.length > 0 && (
            <DiscoveryShelf
              meta={discovery.meta.vod_new_movies}
              items={newlyAddedItems}
            />
          )}
          {genreShelves.map((shelf) => (
            <MediaShelf
              key={shelf.categoryId}
              title={shelf.title}
              items={enrichMovieShelfItems(shelf.items, movies.data)}
              seeAllHref={`/app/movies?category=${encodeURIComponent(shelf.categoryId)}`}
            />
          ))}
        </div>
      )}

      {selected !== "all" && (
        <ActiveCategoryFilterBar
          categoryName={selectedCategoryName || "Selected category"}
          count={movies.isLoading ? undefined : visible.length}
          countLabel={
            visible.length === 1 ? "movie in view" : "movies in view"
          }
          onClear={() => setCategory("all")}
        />
      )}

      {movies.isLoading ? (
        <SkeletonGrid count={18} />
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center text-(--text-muted)">
          No movies match your filters.
        </div>
      ) : tvShelfBrowse ? (
        <p className="text-sm text-(--text-muted) card px-4 py-3 text-pretty">
          Pick a genre above or open a shelf row to browse. Use Search in the top
          bar to find a title across the catalog.
        </p>
      ) : (
        <>
          <div ref={catalogGridRef} className="scroll-mt-20">
            {(showDiscovery || sort !== "added") && (
              <div className="pt-1 pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
                  Full catalog
                </p>
                <h2 className="text-base font-bold text-(--text) leading-tight">
                  All Movies
                  {sortLabel ? (
                    <span className="text-(--text-muted) font-medium">
                      {" "}
                      · {sortLabel}
                    </span>
                  ) : null}
                </h2>
              </div>
            )}
          <VirtualMediaCatalogGrid
          items={displayVisible}
          maxItems={400}
          itemKey={(m) => m.stream_id}
          revision={gridRevision}
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
          footer={
            visible.length > 600 ? (
              <div className="text-center text-xs text-(--text-muted) py-3">
                Showing first 600 of {visible.length}. Filter to see more.
              </div>
            ) : null
          }
        />
          </div>
        </>
      )}
    </div>
  );
}
