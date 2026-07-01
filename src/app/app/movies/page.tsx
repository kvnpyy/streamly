"use client";

import { CatalogGridLoadMore } from "@/components/CatalogGridLoadMore";
import { ActiveCategoryFilterBar } from "@/components/ActiveCategoryFilterBar";
import { VirtualMediaCatalogGrid } from "@/components/VirtualMediaCatalogGrid";
import { DiscoveryShelf } from "@/components/DiscoveryShelf";
import { MediaShelf } from "@/components/MediaShelf";
import { useCatalogPageReady } from "@/hooks/use-catalog-page-ready";
import { useCatalogPlay } from "@/hooks/use-catalog-play";
import { isDiscoveryShelvesEnabled, DISCOVERY_SHELF_META } from "@/lib/discovery";
import { attachMovieDiscoveryShelfItems } from "@/lib/attach-discovery-shelf-items";
import { VodGenreBar } from "@/components/VodGenreBar";
import { VodLanguageFilter } from "@/components/VodLanguageFilter";
import { MediaCard } from "@/components/MediaCard";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { parsePositiveRouteId } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import { looksAdult } from "@/lib/utils";
import { slimVodCatalogQueryOptions } from "@/lib/slim-vod-catalog-query";
import {
  catalogGridTotal,
  catalogItemsNextPageParam,
  fetchVodCatalogGridPage,
  flattenVodItemsPages,
  vodCatalogGridInfiniteKey,
} from "@/lib/vod-catalog-infinite";
import { vodItemsQueryOptions } from "@/lib/vod-catalog-items";
import { vodDiscoveryShelvesQueryOptions } from "@/lib/vod-discovery-shelves-query";
import { filterMediaShelfItems } from "@/lib/vod-discovery-shelf-filter";
import { useFilteredVodDiscoveryShelves } from "@/hooks/use-filtered-vod-discovery-shelves";
import type { VodStream, XtreamCredentials } from "@/lib/xtream-types";
import { useAuth } from "@/store/auth";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  CatalogSortToggle,
  catalogSortLabel,
  type CatalogSort,
} from "@/components/CatalogSortToggle";
import { shouldUseInstantCatalogGrid } from "@/lib/catalog-sort";
import { useTvPresentation } from "@/lib/use-living-room-home-layout";
import { useTvSimpleMode } from "@/lib/tv-simple-mode";
import { TvSimpleVodBrowse } from "@/components/tv/TvSimpleVodBrowse";
import { useVodLanguageBrowse } from "@/hooks/use-vod-language-browse";
import { vodLanguageLabel } from "@/lib/vod-language";
import { scheduleWhenIdle } from "@/lib/defer-idle";
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
  const tvSimple = useTvSimpleMode();
  if (tvSimple) {
    return (
      <TvSimpleVodBrowse kind="movie" creds={creds} accountKey={accountKey} />
    );
  }
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
  const slimCatalog = useQuery(slimVodCatalogQueryOptions(creds, catalogReady));

  const cats = useMemo(
    () => ({
      data: slimCatalog.data?.categories,
      isLoading: !catalogReady || slimCatalog.isLoading,
      isError: slimCatalog.isError,
      isFetched: slimCatalog.isFetched,
    }),
    [
      slimCatalog.data?.categories,
      catalogReady,
      slimCatalog.isLoading,
      slimCatalog.isError,
      slimCatalog.isFetched,
    ]
  );

  const countById = slimCatalog.data?.countByCategoryId ?? {};
  const catalogLanguages = slimCatalog.data?.languages ?? [];

  const { selectedLanguage, setLanguage, languageActive } = useVodLanguageBrowse({
    accountKey,
    prefKey: "moviesLanguage",
    searchParams,
    pathname,
    router,
  });

  const catalogMetaReady = catalogReady && slimCatalog.isSuccess;

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

  const gridParams = useMemo(
    () => ({
      categoryId: selected,
      sort,
      q: qFilter.trim() || undefined,
      lang: languageActive ? selectedLanguage : undefined,
    }),
    [selected, sort, qFilter, languageActive, selectedLanguage]
  );

  const itemsPage = useInfiniteQuery({
    queryKey: vodCatalogGridInfiniteKey(creds, gridParams),
    queryFn: ({ pageParam, signal }) =>
      fetchVodCatalogGridPage(creds, gridParams, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: catalogItemsNextPageParam,
    enabled: catalogMetaReady,
    staleTime: 60_000,
    gcTime: 120_000,
    structuralSharing: false,
    refetchOnWindowFocus: false,
  });

  const visible = useMemo(() => {
    const list = flattenVodItemsPages(itemsPage.data);
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter(
      (s) =>
        allowedCatIds.has(String(s.category_id)) &&
        !looksAdult({ name: s.name, is_adult: s.is_adult })
    );
  }, [itemsPage.data, hideAdult, parentalUnlocked, allowedCatIds]);

  const totalInView = catalogGridTotal(itemsPage.data) || visible.length;
  const moviesLoading = !catalogMetaReady || itemsPage.isLoading;
  const loadMoreMovies = useCallback(() => {
    if (!itemsPage.hasNextPage || itemsPage.isFetchingNextPage) return;
    void itemsPage.fetchNextPage();
  }, [itemsPage]);

  const recentMovieIds = useMemo(
    () =>
      recents
        .filter((r) => r.kind === "movie")
        .slice(0, 20)
        .map((r) => r.id),
    [recents]
  );

  const recentMoviesPage = useQuery(
    vodItemsQueryOptions(
      creds,
      {
        categoryId: "all",
        streamIds: recentMovieIds,
        limit: 20,
      },
      catalogMetaReady && recentMovieIds.length > 0
    )
  );

  // ── Discovery shelves ───────────────────────────────────────────────────

  /** Recently watched movies (from persisted recents store). */
  const recentMovieItems = useMemo(() => {
    const movieById = new Map(
      (recentMoviesPage.data?.items ?? []).map((m) => [m.stream_id, m])
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
          categoryId: movie ? String(movie.category_id) : undefined,
          isFavorite: isFavorite("movie", mid),
          onToggleFavorite: () =>
            toggleFavorite({ kind: "movie", id: mid, name: r.name, icon: r.icon }),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [recents, recentMoviesPage.data?.items, isFavorite, toggleFavorite]);

  const toggleFavoriteMovie = useCallback(
    (m: VodStream, mid: number) => {
      toggleFavorite({ kind: "movie", id: mid, name: m.name, icon: m.stream_icon });
    },
    [toggleFavorite]
  );

  const discoveryOn = isDiscoveryShelvesEnabled();

  const recentMovieIdsForShelves = useMemo(
    () =>
      recents
        .filter((r) => r.kind === "movie")
        .slice(0, 20)
        .map((r) => r.id),
    [recents]
  );

  const favoriteMovieIds = useMemo(
    () => favorites.filter((f) => f.kind === "movie").map((f) => f.id),
    [favorites]
  );

  const [discoveryReady, setDiscoveryReady] = useState(false);
  useEffect(() => {
    if (slimCatalog.isLoading || !discoveryOn) {
      queueMicrotask(() => setDiscoveryReady(false));
      return;
    }
    return scheduleWhenIdle(() => setDiscoveryReady(true), 2_500);
  }, [slimCatalog.isLoading, discoveryOn]);

  const discoveryShelves = useQuery(
    vodDiscoveryShelvesQueryOptions(
      creds,
      {
        hideAdult,
        parentalUnlocked,
        recentIds: recentMovieIdsForShelves,
        favoriteIds: favoriteMovieIds,
      },
      discoveryReady
    )
  );

  const attachMovieShelves = useCallback(
    (items: Parameters<typeof attachMovieDiscoveryShelfItems>[0]) =>
      attachMovieDiscoveryShelfItems(items, {
        isFavorite: (id) => isFavorite("movie", id),
        toggleFavoriteMovie,
        playMovie,
      }),
    [isFavorite, toggleFavoriteMovie, playMovie]
  );

  const shelfFilter = useMemo(
    () => ({
      categoryId: selected,
      q: qFilter.trim() || undefined,
      lang: languageActive ? selectedLanguage : undefined,
      categoryNameById: new Map(
        filteredCats.map((c) => [String(c.category_id), c.category_name])
      ),
    }),
    [selected, qFilter, languageActive, selectedLanguage, filteredCats]
  );

  const {
    topRated: topRatedItems,
    newlyAdded: newlyAddedItems,
    forYou: forYouItems,
    trending: trendingItems,
    genreShelves,
  } = useFilteredVodDiscoveryShelves(
    discoveryShelves.data,
    shelfFilter,
    attachMovieShelves
  );

  const recentLookupList = useMemo(
    () => recentMoviesPage.data?.items ?? [],
    [recentMoviesPage.data?.items]
  );

  const playableRecentMovies = useMemo(
    () =>
      enrichMovieShelfItems(
        filterMediaShelfItems(recentMovieItems, shelfFilter),
        recentLookupList
      ),
    [recentMovieItems, recentLookupList, enrichMovieShelfItems, shelfFilter]
  );

  const showDiscovery =
    discoveryReady && discoveryOn && !slimCatalog.isLoading;

  const hasActiveBrowseFilter =
    selected !== "all" || Boolean(qFilter.trim()) || languageActive;

  const tvPresentation = useTvPresentation();
  const tvShelfBrowse =
    tvPresentation && showDiscovery && !hasActiveBrowseFilter && sort === "added";

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
        selectedLanguage,
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
      selectedLanguage,
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
              <div className="flex flex-wrap items-center gap-2">
                <VodGenreBar
                  categories={filteredCats}
                  value={selected}
                  onChange={setCategory}
                  countById={countById}
                  hideAdult={hideAdultGenres}
                />
                <VodLanguageFilter
                  detectedLanguages={catalogLanguages}
                  value={selectedLanguage}
                  onChange={setLanguage}
                />
              </div>
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

      {/* ── Discovery shelves (items filtered when browse filters are active) ── */}
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
              meta={DISCOVERY_SHELF_META.vod_for_you_movies}
              items={forYouItems}
            />
          )}
          {discoveryOn && trendingItems.length > 0 && (
            <DiscoveryShelf
              meta={DISCOVERY_SHELF_META.vod_trending_movies}
              items={trendingItems}
              loading={discoveryShelves.isLoading && trendingItems.length === 0}
            />
          )}
          {topRatedItems.length > 0 && (
            <DiscoveryShelf
              meta={DISCOVERY_SHELF_META.vod_top_rated_movies}
              items={topRatedItems}
            />
          )}
          {newlyAddedItems.length > 0 && (
            <DiscoveryShelf
              meta={DISCOVERY_SHELF_META.vod_new_movies}
              items={newlyAddedItems}
            />
          )}
          {genreShelves.map((shelf) => (
            <MediaShelf
              key={shelf.categoryId}
              title={shelf.title}
              items={shelf.items}
              seeAllHref={`/app/movies?category=${encodeURIComponent(shelf.categoryId)}`}
            />
          ))}
        </div>
      )}

      {languageActive && (
        <ActiveCategoryFilterBar
          eyebrow="Language filter on"
          categoryName={vodLanguageLabel(selectedLanguage)}
          count={moviesLoading ? undefined : totalInView}
          countLabel={
            visible.length === 1 ? "movie in view" : "movies in view"
          }
          clearLabel="All languages"
          onClear={() => setLanguage("all")}
        />
      )}

      {selected !== "all" && (
        <ActiveCategoryFilterBar
          categoryName={selectedCategoryName || "Selected category"}
          count={moviesLoading ? undefined : totalInView}
          countLabel={
            visible.length === 1 ? "movie in view" : "movies in view"
          }
          onClear={() => setCategory("all")}
        />
      )}

      {moviesLoading ? (
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
          maxItems={displayVisible.length}
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
            <CatalogGridLoadMore
              loaded={visible.length}
              total={totalInView}
              hasMore={Boolean(itemsPage.hasNextPage)}
              loading={itemsPage.isFetchingNextPage}
              onLoadMore={loadMoreMovies}
              label={visible.length === 1 ? "movie" : "movies"}
            />
          }
        />
          </div>
        </>
      )}
    </div>
  );
}
