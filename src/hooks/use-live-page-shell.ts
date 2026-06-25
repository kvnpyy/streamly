"use client";

import { slimLiveCatalogQueryOptions } from "@/lib/live-catalog-query";
import { pickCountByIdForVisibleCategories } from "@/lib/live-category-counts";
import { orderedLiveCategories } from "@/lib/live-category-sort";
import { useLiveSearchContext } from "@/lib/live-search-context";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import { preloadHlsModule } from "@/lib/lazy-hls";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import { isMobileShellWidth } from "@/lib/shell-layout";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { looksAdult } from "@/lib/utils";
import type { Category, XtreamCredentials } from "@/lib/xtream-types";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { useLivingRoomHomeLayout } from "@/lib/use-living-room-home-layout";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { SlimLiveCatalog } from "@/lib/slim-live-catalog";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

export type LiveViewMode = "list" | "guide";

export type LivePageShell = {
  creds: XtreamCredentials;
  accountKey: string;
  tvBrowser: boolean;
  tvLivingRoom: boolean;
  catalog: UseQueryResult<SlimLiveCatalog, Error>;
  cats: {
    data: Category[] | undefined;
    isLoading: boolean;
    isError: boolean;
    isFetched: boolean;
  };
  streams: { isLoading: boolean; isError: boolean; isFetched: boolean };
  filteredCats: Category[];
  sortedFilteredCats: Category[];
  countById: Record<string, number>;
  categoryNameById: Record<string, string>;
  selected: string | "all";
  setCategory: (v: string | "all") => void;
  view: LiveViewMode;
  setViewMode: (v: LiveViewMode) => void;
  viewSwitchPending: boolean;
  q: string;
  setQ: (v: string) => void;
  clearLiveSearch: () => void;
  qTrim: string;
  qLower: string;
  deferredQLower: string;
  liveSearchRef: React.RefObject<HTMLInputElement | null>;
  shelfBrowseActive: boolean;
  hideAdult: boolean;
  parentalUnlocked: boolean;
};

/** Lightweight Live page state — no channel list, EPG search, or discovery hooks. */
export function useLivePageShell(
  creds: XtreamCredentials,
  accountKey: string
): LivePageShell {
  const tvBrowser = useTvBrowser();
  const livingRoomHome = useLivingRoomHomeLayout();
  const tvLivingRoom = tvBrowser || livingRoomHome;

  const hideAdult = usePrefs((s) => s.hideAdult);
  const parentalUnlocked = usePrefs((s) => s.parentalUnlocked);
  const setBrowsePref = usePrefs((s) => s.setBrowsePref);

  const {
    inputValue: q,
    setInputValue: setQ,
    clear: clearLiveSearch,
    qTrim,
    qLower,
    deferredQLower,
  } = useLiveSearchContext();

  useEffect(() => {
    if (isMobileShellWidth()) {
      return scheduleWhenIdle(() => preloadHlsModule(), 5_000);
    }
    preloadHlsModule();
  }, []);

  const liveSearchRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(liveSearchRef);

  const [categoryOverride, setCategoryOverride] = useState<string | "all" | null>(
    null
  );
  const [viewOverride, setViewOverride] = useState<LiveViewMode | null>(null);

  const savedLiveCategory = usePrefs(
    (s) => s.browseByAccount[accountKey]?.liveCategory
  );
  const savedLiveView = usePrefs((s) => s.browseByAccount[accountKey]?.liveView);

  const prefsCategory: string | "all" =
    savedLiveCategory === undefined
      ? "all"
      : savedLiveCategory === "all"
        ? "all"
        : String(savedLiveCategory);

  const prefsView: LiveViewMode =
    savedLiveView === "list" || savedLiveView === "guide" ? savedLiveView : "list";

  const selectedBase = categoryOverride ?? prefsCategory;
  const view = viewOverride ?? prefsView;

  const setCategory = useCallback(
    (v: string | "all") => {
      const next = v === "all" ? "all" : String(v);
      setCategoryOverride(next);
      queueMicrotask(() => {
        setBrowsePref(accountKey, { liveCategory: next });
      });
    },
    [accountKey, setBrowsePref]
  );

  const [viewSwitchPending, startViewSwitch] = useTransition();

  const setViewMode = useCallback(
    (v: LiveViewMode) => {
      startViewSwitch(() => {
        setViewOverride(v);
        setBrowsePref(accountKey, { liveView: v });
      });
    },
    [accountKey, setBrowsePref, startViewSwitch]
  );

  const catalog = useQuery(slimLiveCatalogQueryOptions(creds));

  const cats = useMemo(
    () => ({
      data: catalog.data?.categories,
      isLoading: catalog.isLoading,
      isError: catalog.isError,
      isFetched: catalog.isFetched,
    }),
    [catalog.data?.categories, catalog.isLoading, catalog.isError, catalog.isFetched]
  );

  const streams = useMemo(
    () => ({
      isLoading: catalog.isLoading,
      isError: catalog.isError,
      isFetched: catalog.isFetched,
    }),
    [catalog.isLoading, catalog.isError, catalog.isFetched]
  );

  const liveBrowsePrefs = usePrefs((s) => s.browseByAccount[accountKey]);

  const filteredCats = useMemo(() => {
    const list = cats.data || [];
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter((c) => !looksAdult({ category_name: c.category_name }));
  }, [cats.data, hideAdult, parentalUnlocked]);

  const sortedFilteredCats = useMemo(
    () => orderedLiveCategories(filteredCats, liveBrowsePrefs),
    [filteredCats, liveBrowsePrefs]
  );

  const allowedCatIds = useMemo(() => {
    const fromCats = new Set(filteredCats.map((c) => String(c.category_id)));
    if (!(hideAdult && !parentalUnlocked)) return fromCats;
    if (fromCats.size > 0) return fromCats;
    const catalogueLoadedButAllCategoriesHidden =
      cats.isFetched &&
      !cats.isError &&
      Array.isArray(cats.data) &&
      cats.data.length > 0;
    if (catalogueLoadedButAllCategoriesHidden) return fromCats;
    return fromCats;
  }, [
    filteredCats,
    hideAdult,
    parentalUnlocked,
    cats.isFetched,
    cats.isError,
    cats.data,
  ]);

  const selected =
    selectedBase !== "all" &&
    filteredCats.length > 0 &&
    !allowedCatIds.has(String(selectedBase))
      ? "all"
      : selectedBase;

  useEffect(() => {
    if (selectedBase === selected) return;
    setBrowsePref(accountKey, { liveCategory: "all" });
    queueMicrotask(() => setCategoryOverride(null));
  }, [selectedBase, selected, accountKey, setBrowsePref]);

  const categoryNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (cats.data || []).forEach((c) => {
      map[c.category_id] = c.category_name;
    });
    return map;
  }, [cats.data]);

  const visibleCategoryIds = useMemo(
    () => sortedFilteredCats.map((c) => String(c.category_id)),
    [sortedFilteredCats]
  );

  const countById = useMemo(() => {
    const serverCounts = catalog.data?.countByCategoryId;
    if (!serverCounts) return {};
    if (!hideAdult || parentalUnlocked) return serverCounts;
    return pickCountByIdForVisibleCategories(serverCounts, visibleCategoryIds);
  }, [
    catalog.data?.countByCategoryId,
    visibleCategoryIds,
    hideAdult,
    parentalUnlocked,
  ]);

  const shelfBrowseActive =
    selected === "all" &&
    (view === "list" || view === "guide") &&
    !streams.isLoading &&
    sortedFilteredCats.length > 0;

  return {
    creds,
    accountKey,
    tvBrowser,
    tvLivingRoom,
    catalog,
    cats,
    streams,
    filteredCats,
    sortedFilteredCats,
    countById,
    categoryNameById,
    selected,
    setCategory,
    view,
    setViewMode,
    viewSwitchPending,
    q,
    setQ,
    clearLiveSearch,
    qTrim,
    qLower,
    deferredQLower,
    liveSearchRef,
    shelfBrowseActive,
    hideAdult,
    parentalUnlocked,
  };
}

export function livePageAccountKey(creds: XtreamCredentials) {
  return browseAccountKey(creds);
}
