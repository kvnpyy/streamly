"use client";

import { ActiveCategoryFilterBar } from "@/components/ActiveCategoryFilterBar";
import { VirtualMediaCatalogGrid } from "@/components/VirtualMediaCatalogGrid";
import { DiscoveryShelf } from "@/components/DiscoveryShelf";
import { MediaShelf } from "@/components/MediaShelf";
import { useCatalogPageReady } from "@/hooks/use-catalog-page-ready";
import { useSeriesDiscoveryShelves } from "@/hooks/use-vod-discovery-shelves";
import { isDiscoveryShelvesEnabled } from "@/lib/discovery";
import { VodGenreBar } from "@/components/VodGenreBar";
import { MediaCard } from "@/components/MediaCard";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { buildProviderGenreShelves } from "@/lib/vod-genre-discovery";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import {
  buildNameSearchIndex,
  filterByNameQuery,
} from "@/lib/name-search-index";
import { looksAdult, parsePositiveRouteId, safeStr } from "@/lib/utils";
import { seriesCatalogQueryOptions } from "@/lib/series-catalog-query";
import type { SeriesItem, XtreamCredentials } from "@/lib/xtream-types";
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

export default function SeriesPage() {
  const creds = useAuth((s) => s.creds)!;
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);
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
  const [qInput, setQInput] = useState("");
  const seriesSearchRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(seriesSearchRef);
  const qFilter = useDebouncedValue(qInput, 140);
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
  const catalog = useQuery(seriesCatalogQueryOptions(creds, catalogReady));

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

  const items = useMemo(
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
    setBrowsePref(accountKey, { seriesCategory: "all" });
    queueMicrotask(() => setCategoryOverride(null));
  }, [selectedBase, selected, accountKey, setBrowsePref]);

  useEffect(() => {
    if (!fromUrlCategory) return;
    queueMicrotask(() => {
      setBrowsePref(accountKey, { seriesCategory: fromUrlCategory });
    });
  }, [fromUrlCategory, accountKey, setBrowsePref]);

  const seriesCatalog = useMemo(() => {
    const raw = (items.data || []).filter(
      (s) => parsePositiveRouteId(s.series_id) != null
    );
    if (!raw.length) {
      return {
        filtered: [] as SeriesItem[],
        byId: undefined as Map<number, SeriesItem> | undefined,
        idsByCategory: undefined as Record<string, number[]> | undefined,
        countById: {} as Record<string, number>,
      };
    }
    let filtered = raw;
    if (hideAdult && !parentalUnlocked) {
      filtered = filtered.filter(
        (s) =>
          allowedCatIds.has(String(s.category_id)) &&
          !looksAdult({ name: s.name })
      );
    }
    const byId = buildItemByIdMap(filtered, (s) => parsePositiveRouteId(s.series_id)!);
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
      (s) => parsePositiveRouteId(s.series_id)!
    );
    return {
      filtered,
      byId,
      idsByCategory,
      countById: countByCategoryFromIndex(idsByCategory),
    };
  }, [catalog.data, items.data, hideAdult, parentalUnlocked, allowedCatIds]);

  const countById = seriesCatalog.countById;

  const categoryStreams = useMemo(
    () =>
      selected === "all"
        ? seriesCatalog.filtered
        : pickItemsForCategory(
            seriesCatalog.filtered,
            selected,
            seriesCatalog.idsByCategory,
            seriesCatalog.byId
          ),
    [seriesCatalog, selected]
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
    return list;
  }, [categoryStreams, categoryNameIndex, qFilter, sort]);

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
    const allSeries = items.data ?? [];
    const seriesById = new Map(
      allSeries.map((s) => [parsePositiveRouteId(s.series_id), s])
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
          isFavorite: isFavorite("series", sid),
          onToggleFavorite: () =>
            toggleFavorite({ kind: "series", id: sid, name: r.name, icon: r.icon }),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [recents, items.data, isFavorite, toggleFavorite]);

  const toggleFavoriteSeriesItem = useCallback(
    (s: SeriesItem, sid: number) => {
      toggleFavorite({ kind: "series", id: sid, name: s.name, icon: s.cover });
    },
    [toggleFavorite]
  );

  const discoveryOn = isDiscoveryShelvesEnabled();

  const [discoveryReady, setDiscoveryReady] = useState(false);
  useEffect(() => {
    if (selected !== "all" || qFilter || items.isLoading || !discoveryOn) {
      queueMicrotask(() => setDiscoveryReady(false));
      return;
    }
    return scheduleWhenIdle(() => setDiscoveryReady(true), 2_500);
  }, [selected, qFilter, items.isLoading, discoveryOn]);

  const discovery = useSeriesDiscoveryShelves(
    discoveryReady ? items.data : undefined,
    recents,
    favorites,
    {
      hideAdult,
      parentalUnlocked,
      isFavorite,
      toggleFavoriteSeries: toggleFavoriteSeriesItem,
    }
  );

  const topRatedSeriesItems = discovery.topRated;
  const newlyAddedSeriesItems = discovery.newlyAdded;

  const genreShelves = useMemo(
    () =>
      discoveryReady
        ? buildProviderGenreShelves({
            kind: "series",
            categories: filteredCats,
            countById,
            streams: items.data ?? [],
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
      items.data,
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
    !items.isLoading;

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
        recentSeriesItems.length,
        topRatedSeriesItems.length,
        newlyAddedSeriesItems.length,
        genreShelves.map((s) => `${s.categoryId}:${s.items.length}`).join(","),
        selected,
        qFilter,
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
              ref={seriesSearchRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search series…"
              aria-label="Search series"
              className="h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) focus:border-(--brand)/50 outline-none text-sm w-full sm:w-56 min-w-0"
            />
            <CatalogSortToggle sort={sort} onChange={handleSortChange} />
          </div>
        </div>
      </header>

      {/* ── Discovery shelves (hidden when user has active filters) ── */}
      {showDiscovery && (
        <div className="space-y-6">
          {recentSeriesItems.length > 0 && (
            <MediaShelf
              eyebrow="Pick up where you left off"
              title="Continue Watching"
              items={recentSeriesItems}
            />
          )}
          {discoveryOn && discovery.forYou.length > 0 && (
            <DiscoveryShelf
              meta={discovery.meta.vod_for_you_series}
              items={discovery.forYou}
            />
          )}
          {discoveryOn && discovery.trending.length > 0 && (
            <DiscoveryShelf
              meta={discovery.meta.vod_trending_series}
              items={discovery.trending}
              loading={discovery.trendingLoading}
            />
          )}
          {topRatedSeriesItems.length > 0 && (
            <DiscoveryShelf
              meta={discovery.meta.vod_top_rated_series}
              items={topRatedSeriesItems}
            />
          )}
          {newlyAddedSeriesItems.length > 0 && (
            <DiscoveryShelf
              meta={discovery.meta.vod_new_series}
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

      {selected !== "all" && (
        <ActiveCategoryFilterBar
          categoryName={selectedCategoryName || "Selected category"}
          count={items.isLoading ? undefined : visible.length}
          countLabel="series in view"
          onClear={() => setCategory("all")}
        />
      )}

      {items.isLoading ? (
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
          maxItems={400}
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
            visible.length > 600 ? (
              <div className="text-center text-xs text-(--text-muted) py-3">
                Showing first 600 of {visible.length}.
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
