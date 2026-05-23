"use client";

import { ActiveCategoryFilterBar } from "@/components/ActiveCategoryFilterBar";
import { VirtualMediaCatalogGrid } from "@/components/VirtualMediaCatalogGrid";
import { MediaShelf } from "@/components/MediaShelf";
import { MobileCategoryRail } from "@/components/MobileCategoryRail";
import { MediaCard } from "@/components/MediaCard";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { parsePositiveRouteId } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import { looksAdult, safeLower, safeStr } from "@/lib/utils";
import { xtream } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { useAuth } from "@/store/auth";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownAZ, Star, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Sort = "added" | "rating" | "name";

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
  const { isFavorite, toggleFavorite, hideAdult, parentalUnlocked, setBrowsePref, recents } =
    usePrefs();

  const [categoryOverride, setCategoryOverride] = useState<
    string | "all" | null
  >(null);
  const [qInput, setQInput] = useState("");
  const moviesSearchRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(moviesSearchRef);
  const qFilter = useDebouncedValue(qInput, 140);
  const [sort, setSort] = useState<Sort>("added");

  const savedMoviesCategory = usePrefs(
    (s) => s.browseByAccount[accountKey]?.moviesCategory
  );

  const prefsCategory: string | "all" =
    savedMoviesCategory === undefined
      ? "all"
      : savedMoviesCategory === "all"
        ? "all"
        : String(savedMoviesCategory);

  const selectedBase = categoryOverride ?? prefsCategory;

  const setCategory = useCallback(
    (v: string | "all") => {
      const next = v === "all" ? "all" : String(v);
      setCategoryOverride(next);
      setBrowsePref(accountKey, { moviesCategory: next });
    },
    [accountKey, setBrowsePref]
  );

  const cats = useQuery({
    queryKey: ["vod-cats", creds.server, creds.username],
    queryFn: ({ signal }) => xtream.vodCategories(creds, signal),
  });
  const movies = useQuery({
    queryKey: ["vod", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.vodStreams(creds, undefined, signal),
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
    setBrowsePref(accountKey, { moviesCategory: "all" });
    queueMicrotask(() => setCategoryOverride(null));
  }, [selectedBase, selected, accountKey, setBrowsePref]);

  const countById = useMemo(() => {
    const map: Record<string, number> = {};
    (movies.data || []).forEach((s) => {
      const cid = String(s.category_id);
      if (hideAdult && !parentalUnlocked) {
        if (!allowedCatIds.has(cid)) return;
        if (looksAdult({ name: s.name, is_adult: s.is_adult })) return;
      }
      map[cid] = (map[cid] || 0) + 1;
    });
    return map;
  }, [movies.data, hideAdult, parentalUnlocked, allowedCatIds]);

  const visible = useMemo(() => {
    let list = movies.data || [];
    if (hideAdult && !parentalUnlocked) {
      list = list.filter(
        (s) =>
          allowedCatIds.has(String(s.category_id)) &&
          !looksAdult({ name: s.name, is_adult: s.is_adult })
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
    /* sort === "added": keep panel order (avoids O(n log n) on huge catalogs). */
    return list;
  }, [
    movies.data,
    selected,
    qFilter,
    sort,
    hideAdult,
    parentalUnlocked,
    allowedCatIds,
  ]);

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

  /** Top-rated movies — sorted by Xtream rating, capped at 24. */
  const topRatedItems = useMemo(() => {
    const safe_ = hideAdult && !parentalUnlocked;
    return (movies.data ?? [])
      .filter((m) => {
        if (parsePositiveRouteId(m.stream_id) == null) return false;
        if (safe_ && looksAdult({ name: m.name, is_adult: m.is_adult })) return false;
        return (parseFloat(m.rating || "0") || 0) >= 6;
      })
      .sort(
        (a, b) =>
          (parseFloat(b.rating || "0") || 0) - (parseFloat(a.rating || "0") || 0)
      )
      .slice(0, 24)
      .map((m) => {
        const mid = parsePositiveRouteId(m.stream_id)!;
        return {
          id: mid,
          href: `/app/movies/${mid}`,
          poster: m.stream_icon,
          title: m.name,
          subtitle: m.year,
          rating: m.rating,
          isFavorite: isFavorite("movie", mid),
          onToggleFavorite: () =>
            toggleFavorite({ kind: "movie", id: mid, name: m.name, icon: m.stream_icon }),
        };
      });
  }, [movies.data, hideAdult, parentalUnlocked, isFavorite, toggleFavorite]);

  /** Newly added movies — provider order (newest first), capped at 24. */
  const newlyAddedItems = useMemo(() => {
    const safe_ = hideAdult && !parentalUnlocked;
    return (movies.data ?? [])
      .filter((m) => {
        if (parsePositiveRouteId(m.stream_id) == null) return false;
        if (safe_ && looksAdult({ name: m.name, is_adult: m.is_adult })) return false;
        return true;
      })
      .slice(0, 24)
      .map((m) => {
        const mid = parsePositiveRouteId(m.stream_id)!;
        return {
          id: mid,
          href: `/app/movies/${mid}`,
          poster: m.stream_icon,
          title: m.name,
          subtitle: m.year,
          rating: m.rating,
          isFavorite: isFavorite("movie", mid),
          onToggleFavorite: () =>
            toggleFavorite({ kind: "movie", id: mid, name: m.name, icon: m.stream_icon }),
        };
      });
  }, [movies.data, hideAdult, parentalUnlocked, isFavorite, toggleFavorite]);

  const selectedCategoryName = useMemo(() => {
    if (selected === "all") return "";
    const sid = String(selected);
    return (
      filteredCats.find((c) => String(c.category_id) === sid)?.category_name ||
      ""
    );
  }, [selected, filteredCats]);

  return (
    <div className="space-y-5">
      <SectionHeader
        hideDescriptionOnMobile
        eyebrow="On demand"
        title="Movies"
        description={
          selected === "all"
            ? "Thousands of titles from your provider, sorted however you like."
            : `Showing movies in “${selectedCategoryName || "this category"}” only. Clear the filter below or pick “All” in the sidebar for the full catalog.`
        }
        right={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
            <input
              ref={moviesSearchRef}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search movies…"
              aria-label="Search movies"
              className="h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) focus:border-(--brand)/50 outline-none text-sm w-full sm:w-56 min-w-0"
            />
            <SortToggle sort={sort} setSort={setSort} />
          </div>
        }
      />

      {/* ── Discovery shelves (hidden when user has active filters) ── */}
      {selected === "all" && !qFilter && !movies.isLoading && (
        <div className="space-y-6">
          {recentMovieItems.length > 0 && (
            <MediaShelf
              eyebrow="Pick up where you left off"
              title="Continue Watching"
              items={recentMovieItems}
            />
          )}
          {topRatedItems.length > 0 && (
            <MediaShelf
              eyebrow="Highly rated"
              title="Top Rated"
              items={topRatedItems}
            />
          )}
          {newlyAddedItems.length > 0 && (
            <MediaShelf
              eyebrow="Fresh from your provider"
              title="Newly Added"
              items={newlyAddedItems}
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
      ) : (
        <VirtualMediaCatalogGrid
          items={visible}
          maxItems={600}
          itemKey={(m) => m.stream_id}
          revision={`${movies.isLoading ? "loading" : "loaded"}:${selected}:${qFilter}`}
          renderItem={(m) => (
            <MediaCard
              href={`/app/movies/${m.stream_id}`}
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
          )}
          footer={
            visible.length > 600 ? (
              <div className="text-center text-xs text-(--text-muted) py-3">
                Showing first 600 of {visible.length}. Filter to see more.
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
