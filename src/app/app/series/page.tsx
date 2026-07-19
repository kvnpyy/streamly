"use client";

import { CatalogGridLoadMore } from "@/components/CatalogGridLoadMore";
import { ActiveCategoryFilterBar } from "@/components/ActiveCategoryFilterBar";
import { VirtualMediaCatalogGrid } from "@/components/VirtualMediaCatalogGrid";
import { DiscoveryShelf } from "@/components/DiscoveryShelf";
import { MediaShelf } from "@/components/MediaShelf";
import { useCatalogPageReady } from "@/hooks/use-catalog-page-ready";
import { isDiscoveryShelvesEnabled, DISCOVERY_SHELF_META } from "@/lib/discovery";
import { attachSeriesDiscoveryShelfItems } from "@/lib/attach-discovery-shelf-items";
import { VodGenreBar } from "@/components/VodGenreBar";
import { VodLanguageFilter } from "@/components/VodLanguageFilter";
import { MediaCard } from "@/components/MediaCard";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { useCatalogBrowseSearch } from "@/lib/catalog-browse-search-context";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import { looksAdult, parsePositiveRouteId } from "@/lib/utils";
import { slimSeriesCatalogQueryOptions } from "@/lib/slim-series-catalog-query";
import {
  catalogGridTotal,
  catalogItemsNextPageParam,
  fetchSeriesCatalogGridPage,
  flattenCatalogPages,
  seriesCatalogGridInfiniteKey,
} from "@/lib/vod-catalog-infinite";
import {
  seriesItemsQueryOptions,
} from "@/lib/series-catalog-items";
import { seriesDiscoveryShelvesQueryOptions } from "@/lib/series-discovery-shelves-query";
import { filterMediaShelfItems } from "@/lib/vod-discovery-shelf-filter";
import { useFilteredVodDiscoveryShelves } from "@/hooks/use-filtered-vod-discovery-shelves";
import type { SeriesItem, XtreamCredentials } from "@/lib/xtream-types";
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

export default function SeriesPage() {
  const creds = useAuth((s) => s.creds)!;
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);
  const tvSimple = useTvSimpleMode();
  if (tvSimple) {
    return (
      <TvSimpleVodBrowse kind="series" creds={creds} accountKey={accountKey} />
    );
  }
  return (
    <SeriesPageInner key={accountKey} creds={creds} accountKey={accountKey} />
  );
}

function SeriesPageInner({
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [categoryOverride, setCategoryOverride] = useState<
    string | "all" | null
  >(null);
  const { qFilter } = useCatalogBrowseSearch();
  const slashSearchRef = useRef<HTMLInputElement | null>(null);
  useSlashFocusSearch(slashSearchRef);
  const [sort, setSort] = useState<CatalogSort>("added");
  const catalogGridRef = useRef<HTMLDivElement>(null);

  const savedSeriesCategory = usePrefs(
    (s) => s.browseByAccount[accountKey]?.seriesCategory
  );

  const prefsCategory: string | "all" =
    savedSeriesCategory === undefined
      ? "all"
      : savedSeriesCategory === "all"
        ? "all"
        : String(savedSeriesCategory);

  const [, startCategorySwitch] = useTransition();

  const setCategory = useCallback(
    (v: string | "all") => {
      startCategorySwitch(() => {
        const next = v === "all" ? "all" : String(v);
        setCategoryOverride(next);
        setBrowsePref(accountKey, { seriesCategory: next });
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
  const slimCatalog = useQuery(slimSeriesCatalogQueryOptions(creds, catalogReady));

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
    prefKey: "seriesLanguage",
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
    setBrowsePref(accountKey, { seriesCategory: "all" });
    queueMicrotask(() => setCategoryOverride(null));
  }, [selectedBase, selected, accountKey, setBrowsePref]);

  useEffect(() => {
    if (!fromUrlCategory) return;
    queueMicrotask(() => {
      setBrowsePref(accountKey, { seriesCategory: fromUrlCategory });
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
    queryKey: seriesCatalogGridInfiniteKey(creds, gridParams),
    queryFn: ({ pageParam, signal }) =>
      fetchSeriesCatalogGridPage(creds, gridParams, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: catalogItemsNextPageParam,
    enabled: catalogMetaReady,
    staleTime: 60_000,
    gcTime: 120_000,
    structuralSharing: false,
    refetchOnWindowFocus: false,
  });

  const visible = useMemo(() => {
    const list = flattenCatalogPages(itemsPage.data).filter(
      (s): s is SeriesItem =>
        typeof s === "object" &&
        s != null &&
        parsePositiveRouteId((s as SeriesItem).series_id) != null
    );
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter(
      (s) =>
        allowedCatIds.has(String(s.category_id)) &&
        !looksAdult({ name: s.name })
    );
  }, [itemsPage.data, hideAdult, parentalUnlocked, allowedCatIds]);

  const totalInView = catalogGridTotal(itemsPage.data) || visible.length;
  const seriesLoading = !catalogMetaReady || itemsPage.isLoading;
  const loadMoreSeries = useCallback(() => {
    if (!itemsPage.hasNextPage || itemsPage.isFetchingNextPage) return;
    void itemsPage.fetchNextPage();
  }, [itemsPage]);

  const recentSeriesIds = useMemo(
    () =>
      recents
        .filter((r) => r.kind === "series")
        .slice(0, 20)
        .map((r) => r.id),
    [recents]
  );

  const recentSeriesPage = useQuery(
    seriesItemsQueryOptions(
      creds,
      {
        categoryId: "all",
        streamIds: recentSeriesIds,
        limit: 20,
      },
      catalogMetaReady && recentSeriesIds.length > 0
    )
  );

  const selectedCategoryName = useMemo(() => {
    if (selected === "all") return "";
    const sid = String(selected);
    return (
      filteredCats.find((c) => String(c.category_id) === sid)?.category_name ||
      ""
    );
  }, [selected, filteredCats]);

  // ── Discovery shelves ──────────────────────────────────────────────────

  const recentSeriesItems = useMemo(() => {
    const seriesById = new Map(
      (recentSeriesPage.data?.items ?? []).map((s) => [
        parsePositiveRouteId(s.series_id),
        s,
      ])
    );
    return recents
      .filter((r) => r.kind === "series")
      .slice(0, 20)
      .map((r) => {
        const sid = parsePositiveRouteId(r.id);
        if (sid == null) return null;
        const s = seriesById.get(sid);
        return {
          id: sid,
          href: `/app/series/${sid}`,
          poster: s?.cover ?? r.icon,
          title: r.name,
          subtitle: s?.year,
          rating: s?.rating,
          categoryId: s ? String(s.category_id) : undefined,
          isFavorite: isFavorite("series", sid),
          onToggleFavorite: () =>
            toggleFavorite({ kind: "series", id: sid, name: r.name, icon: r.icon }),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [recents, recentSeriesPage.data?.items, isFavorite, toggleFavorite]);

  const toggleFavoriteSeriesItem = useCallback(
    (s: SeriesItem, sid: number) => {
      toggleFavorite({ kind: "series", id: sid, name: s.name, icon: s.cover });
    },
    [toggleFavorite]
  );

  const discoveryOn = isDiscoveryShelvesEnabled();

  const recentSeriesIdsForShelves = useMemo(
    () =>
      recents
        .filter((r) => r.kind === "series")
        .slice(0, 20)
        .map((r) => r.id),
    [recents]
  );

  const favoriteSeriesIds = useMemo(
    () => favorites.filter((f) => f.kind === "series").map((f) => f.id),
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
    seriesDiscoveryShelvesQueryOptions(
      creds,
      {
        hideAdult,
        parentalUnlocked,
        recentIds: recentSeriesIdsForShelves,
        favoriteIds: favoriteSeriesIds,
      },
      discoveryReady
    )
  );

  const attachSeriesShelves = useCallback(
    (items: Parameters<typeof attachSeriesDiscoveryShelfItems>[0]) =>
      attachSeriesDiscoveryShelfItems(items, {
        isFavorite: (id) => isFavorite("series", id),
        toggleFavoriteSeries: toggleFavoriteSeriesItem,
      }),
    [isFavorite, toggleFavoriteSeriesItem]
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
    topRated: topRatedSeriesItems,
    newlyAdded: newlyAddedSeriesItems,
    forYou: forYouSeriesItems,
    trending: trendingSeriesItems,
    genreShelves,
  } = useFilteredVodDiscoveryShelves(
    discoveryShelves.data,
    shelfFilter,
    attachSeriesShelves
  );

  const filteredRecentSeriesItems = useMemo(
    () => filterMediaShelfItems(recentSeriesItems, shelfFilter),
    [recentSeriesItems, shelfFilter]
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
        recentSeriesItems.length,
        topRatedSeriesItems.length,
        newlyAddedSeriesItems.length,
        genreShelves.map((s) => `${s.categoryId}:${s.items.length}`).join(","),
        selected,
        qFilter,
        selectedLanguage,
      ].join("|"),
    [
      showDiscovery,
      sort,
      recentSeriesItems.length,
      topRatedSeriesItems.length,
      newlyAddedSeriesItems.length,
      genreShelves,
      selected,
      qFilter,
      selectedLanguage,
    ]
  );

  const sortLabel = catalogSortLabel(sort);
  const hideAdultGenres = hideAdult && !parentalUnlocked;

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-3">
            <SectionHeader
              compact
              hideDescriptionOnMobile
              eyebrow="Binge worthy"
              title="Series"
              description={
                selected === "all"
                  ? "Browse by genre or search the full catalog."
                  : `Series in “${selectedCategoryName || "this category"}”.`
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
            <CatalogSortToggle sort={sort} onChange={handleSortChange} />
          </div>
        </div>
      </header>

      {/* ── Discovery shelves (items filtered when browse filters are active) ── */}
      {showDiscovery && (
        <div className="space-y-6">
          {filteredRecentSeriesItems.length > 0 && (
            <MediaShelf
              eyebrow="Pick up where you left off"
              title="Continue Watching"
              items={filteredRecentSeriesItems}
            />
          )}
          {discoveryOn && forYouSeriesItems.length > 0 && (
            <DiscoveryShelf
              meta={DISCOVERY_SHELF_META.vod_for_you_series}
              items={forYouSeriesItems}
            />
          )}
          {discoveryOn && trendingSeriesItems.length > 0 && (
            <DiscoveryShelf
              meta={DISCOVERY_SHELF_META.vod_trending_series}
              items={trendingSeriesItems}
              loading={discoveryShelves.isLoading && trendingSeriesItems.length === 0}
            />
          )}
          {topRatedSeriesItems.length > 0 && (
            <DiscoveryShelf
              meta={DISCOVERY_SHELF_META.vod_top_rated_series}
              items={topRatedSeriesItems}
            />
          )}
          {newlyAddedSeriesItems.length > 0 && (
            <DiscoveryShelf
              meta={DISCOVERY_SHELF_META.vod_new_series}
              items={newlyAddedSeriesItems}
            />
          )}
          {genreShelves.map((shelf) => (
            <MediaShelf
              key={shelf.categoryId}
              title={shelf.title}
              items={shelf.items}
              seeAllHref={`/app/series?category=${encodeURIComponent(shelf.categoryId)}`}
            />
          ))}
        </div>
      )}

      {languageActive && (
        <ActiveCategoryFilterBar
          eyebrow="Language filter on"
          categoryName={vodLanguageLabel(selectedLanguage)}
          count={seriesLoading ? undefined : totalInView}
          countLabel={
            visible.length === 1 ? "series in view" : "series in view"
          }
          clearLabel="All languages"
          onClear={() => setLanguage("all")}
        />
      )}

      {selected !== "all" && (
        <ActiveCategoryFilterBar
          categoryName={selectedCategoryName || "Selected category"}
          count={seriesLoading ? undefined : totalInView}
          countLabel="series in view"
          onClear={() => setCategory("all")}
        />
      )}

      {seriesLoading ? (
        <SkeletonGrid count={18} />
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center text-(--text-muted)">
          No series match your filters.
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
                  All Series
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
          itemKey={(s) => parsePositiveRouteId(s.series_id) ?? s.series_id}
          revision={gridRevision}
          renderItem={(s) => {
            const sid = parsePositiveRouteId(s.series_id)!;
            return (
              <MediaCard
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
          }}
          footer={
            <CatalogGridLoadMore
              loaded={visible.length}
              total={totalInView}
              hasMore={Boolean(itemsPage.hasNextPage)}
              loading={itemsPage.isFetchingNextPage}
              onLoadMore={loadMoreSeries}
              label="series"
            />
          }
        />
          </div>
        </>
      )}
    </div>
  );
}
