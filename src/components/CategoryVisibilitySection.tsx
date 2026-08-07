"use client";

import type { Category } from "@/lib/xtream-types";
import {
  categoryVisibilityPrefKey,
  filterCategoriesByVisibility,
  getVisibleCategoryIds,
  normalizeVisibleCategoryIds,
  type CategoryVisibilityKind,
} from "@/lib/category-visibility";
import { slimLiveCatalogQueryOptions } from "@/lib/live-catalog-query";
import { slimSeriesCatalogQueryOptions } from "@/lib/slim-series-catalog-query";
import { slimVodCatalogQueryOptions } from "@/lib/slim-vod-catalog-query";
import { looksAdult } from "@/lib/utils";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useAuth } from "@/store/auth";
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

type Tab = CategoryVisibilityKind;

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "px-3 py-2 rounded-lg bg-(--brand)/20 border border-(--brand)/35 text-xs font-semibold text-(--text)"
          : "px-3 py-2 rounded-lg border border-(--line) bg-(--bg-3) text-xs text-(--text-dim) hover:border-(--line-2) hover:text-(--text)"
      }
    >
      {children}
    </button>
  );
}

/**
 * Settings: limit which Live / Movies / Series categories appear in pickers.
 * Opt-in — empty selection means show all.
 */
export function CategoryVisibilitySection() {
  const creds = useAuth((s) => s.creds);
  const accountKey = useMemo(
    () => (creds ? browseAccountKey(creds) : ""),
    [creds]
  );
  const hideAdult = usePrefs((s) => s.hideAdult);
  const parentalUnlocked = usePrefs((s) => s.parentalUnlocked);
  const browseByAccount = usePrefs((s) => s.browseByAccount);
  const setBrowsePref = usePrefs((s) => s.setBrowsePref);
  const [tab, setTab] = useState<Tab>("live");

  const liveCatalog = useQuery({
    ...slimLiveCatalogQueryOptions(creds!),
    enabled: !!creds && tab === "live",
  });
  const moviesCatalog = useQuery({
    ...slimVodCatalogQueryOptions(creds!),
    enabled: !!creds && tab === "movies",
  });
  const seriesCatalog = useQuery({
    ...slimSeriesCatalogQueryOptions(creds!),
    enabled: !!creds && tab === "series",
  });

  const rawList: Category[] = useMemo(() => {
    const list =
      tab === "live"
        ? liveCatalog.data?.categories || []
        : tab === "movies"
          ? moviesCatalog.data?.categories || []
          : seriesCatalog.data?.categories || [];
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter((c) => !looksAdult({ category_name: c.category_name }));
  }, [
    tab,
    liveCatalog.data?.categories,
    moviesCatalog.data?.categories,
    seriesCatalog.data?.categories,
    hideAdult,
    parentalUnlocked,
  ]);

  const browsePrefs = browseByAccount[accountKey];
  const selectedIds = useMemo(
    () => getVisibleCategoryIds(browsePrefs, tab) ?? [],
    [browsePrefs, tab]
  );
  const filterActive = selectedIds.length > 0;

  const loading =
    (tab === "live" && liveCatalog.isLoading) ||
    (tab === "movies" && moviesCatalog.isLoading) ||
    (tab === "series" && seriesCatalog.isLoading);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const persistIds = useCallback(
    (ids: string[] | undefined) => {
      if (!accountKey) return;
      const key = categoryVisibilityPrefKey(tab);
      const normalized = normalizeVisibleCategoryIds(ids);
      setBrowsePref(accountKey, {
        [key]: normalized,
      });
    },
    [accountKey, setBrowsePref, tab]
  );

  const enableFilter = useCallback(() => {
    // Start with everything currently listed so nothing disappears until the user unchecks.
    persistIds(rawList.map((c) => String(c.category_id)));
  }, [persistIds, rawList]);

  const showAll = useCallback(() => {
    persistIds(undefined);
  }, [persistIds]);

  const toggleId = useCallback(
    (id: string) => {
      const next = new Set(selectedSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const arr = rawList
        .map((c) => String(c.category_id))
        .filter((cid) => next.has(cid));
      // Keep stale selected ids that aren't in the current list
      for (const sid of selectedIds) {
        if (!arr.includes(sid) && next.has(sid)) arr.push(sid);
      }
      persistIds(arr.length > 0 ? arr : undefined);
    },
    [persistIds, rawList, selectedIds, selectedSet]
  );

  const selectAllListed = useCallback(() => {
    persistIds(rawList.map((c) => String(c.category_id)));
  }, [persistIds, rawList]);

  if (!creds || !accountKey) return null;

  const previewCount = filterCategoriesByVisibility(
    rawList,
    filterActive ? selectedIds : undefined
  ).length;

  return (
    <section className="card p-5">
      <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
        <Eye className="size-4 text-(--brand-2)" />
        Category visibility
      </h3>
      <p className="text-sm text-(--text-dim) mb-4">
        Limit Live, Movies, and Series pickers to categories you actually use for this
        Xtream login. Leave off to show everything from your provider.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <TabButton active={tab === "live"} onClick={() => setTab("live")}>
          Live TV
        </TabButton>
        <TabButton active={tab === "movies"} onClick={() => setTab("movies")}>
          Movies
        </TabButton>
        <TabButton active={tab === "series"} onClick={() => setTab("series")}>
          Series
        </TabButton>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {filterActive ? (
          <>
            <span className="text-xs text-(--text-dim)">
              Showing {previewCount} of {rawList.length} categories
            </span>
            <button
              type="button"
              onClick={selectAllListed}
              className="min-h-9 px-3 rounded-lg border border-(--line) bg-(--bg-3) text-xs hover:border-(--brand)/35"
            >
              Select all listed
            </button>
            <button
              type="button"
              onClick={showAll}
              className="min-h-9 px-3 rounded-lg border border-(--line) bg-(--bg-3) text-xs hover:border-(--brand)/35"
            >
              Show all (clear filter)
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-(--text-dim)">
              Showing all {rawList.length || "…"} categories
            </span>
            <button
              type="button"
              onClick={enableFilter}
              disabled={rawList.length === 0 || loading}
              className="min-h-9 px-3 rounded-lg border border-(--brand)/35 bg-(--brand)/15 text-xs font-medium text-(--text) hover:bg-(--brand)/25 disabled:opacity-40"
            >
              Choose which to show
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-(--text-muted)">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading categories…
        </div>
      ) : rawList.length === 0 ? (
        <p className="text-sm text-(--text-muted)">No categories loaded yet.</p>
      ) : (
        <ul className="max-h-[min(50vh,360px)] overflow-y-auto rounded-xl border border-(--line) divide-y divide-(--line) bg-(--bg-3)/40">
          {rawList.map((c) => {
            const id = String(c.category_id);
            const checked = !filterActive || selectedSet.has(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!filterActive) {
                      // First interaction: enable filter with all selected, then uncheck this one
                      const all = rawList.map((x) => String(x.category_id));
                      persistIds(all.filter((x) => x !== id));
                      return;
                    }
                    toggleId(id);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[2.75rem] text-left hover:bg-(--bg-2)/60"
                  aria-pressed={checked}
                >
                  <span
                    className={
                      checked
                        ? "size-5 rounded-md border border-(--brand)/50 bg-(--brand)/25 text-(--brand) flex items-center justify-center shrink-0"
                        : "size-5 rounded-md border border-(--line-2) bg-(--bg) shrink-0"
                    }
                    aria-hidden
                  >
                    {checked ? <Check className="size-3.5" /> : null}
                  </span>
                  <span className="flex-1 min-w-0 text-sm truncate text-(--text)">
                    {c.category_name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
