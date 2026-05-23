"use client";

import { ActiveCategoryFilterBar } from "@/components/ActiveCategoryFilterBar";
import { VirtualMediaCatalogGrid } from "@/components/VirtualMediaCatalogGrid";
import { MediaShelf } from "@/components/MediaShelf";
import { MobileCategoryRail } from "@/components/MobileCategoryRail";
import { MediaCard } from "@/components/MediaCard";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import { looksAdult, parsePositiveRouteId, safeLower, safeStr } from "@/lib/utils";
import { xtream } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { useAuth } from "@/store/auth";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownAZ, Star, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Sort = "added" | "rating" | "name";

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
  const { isFavorite, toggleFavorite, hideAdult, parentalUnlocked, setBrowsePref, recents } =
    usePrefs();

  const [categoryOverride, setCategoryOverride] = useState<
    string | "all" | null
  >(null);
  const [qInput, setQInput] = useState("");
  const seriesSearchRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(seriesSearchRef);
  const qFilter = useDebouncedValue(qInput, 140);
  const [sort, setSort] = useState<Sort>("added");

  const savedSeriesCategory = usePrefs(
    (s) => s.browseByAccount[accountKey]?.seriesCategory
  );

  const prefsCategory: string | "all" =
    savedSeriesCategory === undefined
      ? "all"
      : savedSeriesCategory === "all"
        ? "all"
        : String(savedSeriesCategory);

  const selectedBase = categoryOverride ?? prefsCategory;

  const setCategory = useCallback(
    (v: string | "all") => {
      const next = v === "all" ? "all" : String(v);
      setCategoryOverride(next);
      setBrowsePref(accountKey, { seriesCategory: next });
    },
    [accountKey, setBrowsePref]
  );

  const cats = useQuery({
    queryKey: ["series-cats", creds.server, creds.username],
    queryFn: ({ signal }) => xtream.seriesCategories(creds, signal),
  });
  const items = useQuery({
    queryKey: ["series", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.series(creds, undefined, signal),
  });

  const filteredCats = useMemo(() => {
    const list = cats.data || [];
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter((c) => !looksAdult({ category_name: c.category_name }));
  }, [cats.data, hideAdult, parentalUnlocked]);

  const allowedCatIds = useMemo(
    () => new Set(filteredCats.map((c) => String(c.category_id))),
    [filteredCats]
  );

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

  const countById = useMemo(() => {
    const map: Record<string, number> = {};
    (items.data || []).forEach((s) => {
      const cid = String(s.category_id);
      if (hideAdult && !parentalUnlocked) {
        if (!allowedCatIds.has(cid)) return;
        if (looksAdult({ name: s.name })) return;
      }
      map[cid] = (map[cid] || 0) + 1;
    });
    return map;
  }, [items.data, hideAdult, parentalUnlocked, allowedCatIds]);

  const visible = useMemo(() => {
    let list = (items.data || []).filter(
      (s) => parsePositiveRouteId(s.series_id) != null
    );
    if (hideAdult && !parentalUnlocked) {
      list = list.filter(
        (s) =>
          allowedCatIds.has(String(s.category_id)) &&
          !looksAdult({ name: s.name })
      );
    }
    if (selected !== "all") {
      const sel = String(selected);
      list = list.filter((s) => String(s.category_id) === sel);
    }
    const f = qFilter.trim().toLowerCase();
    if (f) list = list.filter((s) => safeLower(s.name).includes(f));
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
  }, [items.data, selected, qFilter, sort, hideAdult, parentalUnlocked, allowedCatIds]);

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

  const topRatedSeriesItems = useMemo(() => {
    const safe_ = hideAdult && !parentalUnlocked;
    return (items.data ?? [])
      .filter((s) => {
        if (parsePositiveRouteId(s.series_id) == null) return false;
        if (safe_ && looksAdult({ name: s.name })) return false;
        return (parseFloat(s.rating || "0") || 0) >= 6;
      })
      .sort(
        (a, b) =>
          (parseFloat(b.rating || "0") || 0) - (parseFloat(a.rating || "0") || 0)
      )
      .slice(0, 24)
      .map((s) => {
        const sid = parsePositiveRouteId(s.series_id)!;
        return {
          id: sid,
          href: `/app/series/${sid}`,
          poster: s.cover,
          title: s.name,
          subtitle: s.year,
          rating: s.rating,
          isFavorite: isFavorite("series", sid),
          onToggleFavorite: () =>
            toggleFavorite({ kind: "series", id: sid, name: s.name, icon: s.cover }),
        };
      });
  }, [items.data, hideAdult, parentalUnlocked, isFavorite, toggleFavorite]);

  const newlyAddedSeriesItems = useMemo(() => {
    const safe_ = hideAdult && !parentalUnlocked;
    return (items.data ?? [])
      .filter((s) => {
        if (parsePositiveRouteId(s.series_id) == null) return false;
        if (safe_ && looksAdult({ name: s.name })) return false;
        return true;
      })
      .slice(0, 24)
      .map((s) => {
        const sid = parsePositiveRouteId(s.series_id)!;
        return {
          id: sid,
          href: `/app/series/${sid}`,
          poster: s.cover,
          title: s.name,
          subtitle: s.year,
          rating: s.rating,
          isFavorite: isFavorite("series", sid),
          onToggleFavorite: () =>
            toggleFavorite({ kind: "series", id: sid, name: s.name, icon: s.cover }),
        };
      });
  }, [items.data, hideAdult, parentalUnlocked, isFavorite, toggleFavorite]);

  return (
    <div className="space-y-5">
      <SectionHeader
        hideDescriptionOnMobile
        eyebrow="Binge worthy"
        title="Series"
        description={
          selected === "all"
            ? "Full seasons and episodes from your provider's catalog."
            : `Showing series in “${selectedCategoryName || "this category"}” only. Clear the filter below or pick “All” in the sidebar for everything.`
        }
        right={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
            <input
              ref={seriesSearchRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search series…"
              aria-label="Search series"
              className="h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) focus:border-(--brand)/50 outline-none text-sm w-full sm:w-56 min-w-0"
            />
            <SortToggle sort={sort} setSort={setSort} />
          </div>
        }
      />

      {/* ── Discovery shelves (hidden when user has active filters) ── */}
      {selected === "all" && !qFilter && !items.isLoading && (
        <div className="space-y-6">
          {recentSeriesItems.length > 0 && (
            <MediaShelf
              eyebrow="Pick up where you left off"
              title="Continue Watching"
              items={recentSeriesItems}
            />
          )}
          {topRatedSeriesItems.length > 0 && (
            <MediaShelf
              eyebrow="Critically acclaimed"
              title="Top Rated"
              items={topRatedSeriesItems}
            />
          )}
          {newlyAddedSeriesItems.length > 0 && (
            <MediaShelf
              eyebrow="Just arrived"
              title="Newly Added"
              items={newlyAddedSeriesItems}
            />
          )}
        </div>
      )}

      {!cats.isLoading && (
        <MobileCategoryRail
          categories={filteredCats}
          value={selected}
          onChange={setCategory}
          countById={countById}
          label="Genre"
        />
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
      ) : (
        <VirtualMediaCatalogGrid
          items={visible}
          maxItems={600}
          itemKey={(s) => parsePositiveRouteId(s.series_id) ?? s.series_id}
          revision={`${items.isLoading ? "loading" : "loaded"}:${selected}:${qFilter}`}
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
      )}
    </div>
  );
}

function SortToggle({ sort, setSort }: { sort: Sort; setSort: (s: Sort) => void }) {
  const items: { value: Sort; label: string; icon: React.ReactNode }[] = [
    { value: "added", label: "New", icon: <TrendingUp className="size-3.5" /> },
    { value: "rating", label: "Rating", icon: <Star className="size-3.5" /> },
    { value: "name", label: "A-Z", icon: <ArrowDownAZ className="size-3.5" /> },
  ];
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-(--bg-2) border border-(--line) w-fit shrink-0 self-start sm:self-auto">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => setSort(i.value)}
          className={
            "flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs " +
            (sort === i.value
              ? "bg-(--bg-3) text-(--text)"
              : "text-(--text-dim) hover:text-(--text)")
          }
        >
          {i.icon}
          {i.label}
        </button>
      ))}
    </div>
  );
}
