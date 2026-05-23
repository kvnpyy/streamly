"use client";

import { ActiveCategoryFilterBar } from "@/components/ActiveCategoryFilterBar";
import { CategoryPicker } from "@/components/CategoryPicker";
import { LiveMediaCard } from "@/components/LiveMediaCard";
import { MobileCategoryRail } from "@/components/MobileCategoryRail";
import { LiveCategoryBrowseModal } from "@/components/LiveCategoryBrowseModal";
import { LiveChannelTile } from "@/components/LiveChannelTile";
import { TvLiveBrowse } from "@/components/TvLiveBrowse";
import { WebLiveBrowse } from "@/components/WebLiveBrowse";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { VirtualLiveChannelGrid } from "@/components/VirtualMediaCatalogGrid";
import { LiveGuide } from "@/components/LiveGuide";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { cn, looksAdult, safeLower } from "@/lib/utils";
import { orderedLiveCategories } from "@/lib/live-category-sort";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { xtream, buildLivePlayUrl } from "@/lib/xtream";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import {
  nowPlayingTitleFromListings,
  SHORT_EPG_STALE_MS,
} from "@/lib/hooks";
import { useSlashFocusSearch } from "@/lib/use-slash-focus-search";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  LayoutList,
  Loader2,
  Radio,
  Search,
  Layers,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Parallel short-EPG requests (HTTP/2 friendly). Slightly higher throughput
 * when we prioritize fewer channels (category filter) first.
 */
const LIVE_SEARCH_EPG_CONCURRENCY = 16;
/** Safety cap for enormous bouquets. */
const LIVE_SEARCH_MAX_SCAN_CHANNELS = 12_000;
/** Flush programme-title index to UI — lower = snappier, higher = fewer commits. */
const LIVE_SEARCH_EPG_FLUSH_EVERY_BATCHES = 2;

type ViewMode = "list" | "guide";

export default function LivePage() {
  const creds = useAuth((s) => s.creds)!;
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);
  return (
    <LivePageInner key={accountKey} creds={creds} accountKey={accountKey} />
  );
}

function LivePageInner({
  creds,
  accountKey,
}: {
  creds: XtreamCredentials;
  accountKey: string;
}) {
  const tvBrowser = useTvBrowser();
  const { play } = usePlayer();
  const {
    isFavorite,
    toggleFavorite,
    addRecent,
    hideAdult,
    parentalUnlocked,
    setBrowsePref,
    recents,
  } = usePrefs();

  const [q, setQ] = useState("");
  const [categoryBrowseOpen, setCategoryBrowseOpen] = useState(false);
  const liveSearchRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(liveSearchRef);
  const [categoryOverride, setCategoryOverride] = useState<
    string | "all" | null
  >(null);
  const [viewOverride, setViewOverride] = useState<ViewMode | null>(null);

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

  const prefsView: ViewMode =
    savedLiveView === "list" || savedLiveView === "guide"
      ? savedLiveView
      : "list";

  const selectedBase = categoryOverride ?? prefsCategory;
  const view = viewOverride ?? prefsView;

  const setCategory = useCallback(
    (v: string | "all") => {
      const next = v === "all" ? "all" : String(v);
      setCategoryOverride(next);
      setBrowsePref(accountKey, { liveCategory: next });
    },
    [accountKey, setBrowsePref]
  );

  const setViewMode = useCallback(
    (v: ViewMode) => {
      setViewOverride(v);
      setBrowsePref(accountKey, { liveView: v });
    },
    [accountKey, setBrowsePref]
  );

  const cats = useQuery({
    queryKey: ["live-cats", creds.server, creds.username],
    queryFn: ({ signal }) => xtream.liveCategories(creds, signal),
  });

  const streams = useQuery({
    queryKey: ["live", creds.server, creds.username, "all"],
    queryFn: ({ signal }) =>
      xtream.liveStreamsAll(creds, {
        prefetchedCategories: cats.data,
        signal,
      }),
  });

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
    if (!(hideAdult && !parentalUnlocked)) {
      return fromCats;
    }
    if (fromCats.size > 0) {
      return fromCats;
    }
    /** Empty allowed set would hide every channel — only intentional when the catalogue loaded and every category was filtered as adult. */
    const catalogueLoadedButAllCategoriesHidden =
      cats.isFetched &&
      !cats.isError &&
      Array.isArray(cats.data) &&
      cats.data.length > 0;
    if (catalogueLoadedButAllCategoriesHidden) {
      return fromCats;
    }
    const fallback = new Set<string>();
    for (const s of streams.data || []) {
      fallback.add(String(s.category_id));
    }
    return fallback;
  }, [
    filteredCats,
    hideAdult,
    parentalUnlocked,
    cats.isFetched,
    cats.isError,
    cats.data,
    streams.data,
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

  const countById = useMemo(() => {
    const map: Record<string, number> = {};
    (streams.data || []).forEach((s) => {
      const cid = String(s.category_id);
      if (hideAdult && !parentalUnlocked) {
        if (!allowedCatIds.has(cid)) return;
        if (looksAdult({ name: s.name, is_adult: s.is_adult })) return;
      }
      map[cid] = (map[cid] || 0) + 1;
    });
    return map;
  }, [streams.data, hideAdult, parentalUnlocked, allowedCatIds]);

  const [nowPlayingMap, setNowPlayingMap] = useState<Map<number, string>>(
    () => new Map()
  );
  const reportNowPlaying = useCallback(
    (id: number) => (title: string | undefined) => {
      setNowPlayingMap((prev) => {
        const prevTitle = prev.get(id);
        if (title) {
          if (prevTitle === title) return prev;
          const next = new Map(prev);
          next.set(id, title);
          return next;
        }
        if (prevTitle === undefined) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    },
    []
  );

  const categoryFilteredStreams = useMemo(() => {
    let list = streams.data || [];
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
    return list;
  }, [streams.data, selected, hideAdult, parentalUnlocked, allowedCatIds]);

  const qTrim = q.trim();
  const qLower = qTrim.toLowerCase();
  /** Keeps list filtering instant on every keystroke while batching EPG scan work. */
  const deferredQLower = useDeferredValue(qLower);
  const programmeSearchCatchUp =
    Boolean(qTrim) && qLower !== deferredQLower;

  const scanCandidateIds = useMemo(() => {
    if (!deferredQLower) return [];
    return categoryFilteredStreams
      .filter((s) => !safeLower(s.name).includes(deferredQLower))
      .map((s) => s.stream_id)
      .slice(0, LIVE_SEARCH_MAX_SCAN_CHANNELS);
  }, [categoryFilteredStreams, deferredQLower]);

  const programLookupTruncated = useMemo(() => {
    if (!deferredQLower) return false;
    const n = categoryFilteredStreams.filter(
      (s) => !safeLower(s.name).includes(deferredQLower)
    ).length;
    return n > LIVE_SEARCH_MAX_SCAN_CHANNELS;
  }, [categoryFilteredStreams, deferredQLower]);

  const queryClient = useQueryClient();
  const [epgSearchTitleByStreamId, setEpgSearchTitleByStreamId] = useState<
    Map<number, string>
  >(() => new Map());
  const [searchScanning, setSearchScanning] = useState(false);
  const [searchScanProgress, setSearchScanProgress] = useState<{
    examined: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!deferredQLower || scanCandidateIds.length === 0) {
      queueMicrotask(() => {
        setEpgSearchTitleByStreamId(new Map());
        setSearchScanning(false);
        setSearchScanProgress(null);
      });
      return;
    }

    /** Snapshot at scan start — avoids restarting the whole scan when the guide updates titles. */
    const nowPlayingSnapshot = new Map(nowPlayingMap);

    /**
     * Same relative order as the filtered channel list (e.g. USA category),
     * but fetch short-EPG first for rows that already reported an on-air title
     * in the guide — those often match with zero extra latency.
     */
    const candidates = [...scanCandidateIds].sort((a, b) => {
      const ma = nowPlayingSnapshot.has(a);
      const mb = nowPlayingSnapshot.has(b);
      if (ma !== mb) return ma ? -1 : 1;
      return a - b;
    });
    const total = candidates.length;
    const indexMap = new Map<number, string>();
    queueMicrotask(() => {
      setEpgSearchTitleByStreamId(new Map());
      setSearchScanning(true);
      setSearchScanProgress({ examined: 0, total });
    });

    let cancelled = false;

    void (async () => {
      let batchesDone = 0;
      for (let i = 0; i < candidates.length; i += LIVE_SEARCH_EPG_CONCURRENCY) {
        if (cancelled) break;

        const slice = candidates.slice(i, i + LIVE_SEARCH_EPG_CONCURRENCY);
        const nowSec = Math.floor(Date.now() / 1000);

        await Promise.all(
          slice.map(async (streamId) => {
            try {
              const data = await queryClient.fetchQuery({
                queryKey: [
                  "short-epg",
                  creds.server,
                  creds.username,
                  streamId,
                  6,
                ],
                queryFn: ({ signal }) =>
                  xtream.shortEPG(creds, streamId, 6, signal),
                staleTime: SHORT_EPG_STALE_MS,
              });
              if (cancelled) return;
              const listings = data?.epg_listings;
              if (!listings?.length) return;
              const title = nowPlayingTitleFromListings(listings, nowSec);
              if (title) indexMap.set(streamId, title);
            } catch {
              /* network — skip */
            }
          })
        );

        if (cancelled) break;

        const examined = Math.min(
          i + LIVE_SEARCH_EPG_CONCURRENCY,
          candidates.length
        );
        setSearchScanProgress({ examined, total });

        batchesDone += 1;
        const isLast = i + LIVE_SEARCH_EPG_CONCURRENCY >= candidates.length;
        if (
          isLast ||
          batchesDone % LIVE_SEARCH_EPG_FLUSH_EVERY_BATCHES === 0
        ) {
          setEpgSearchTitleByStreamId(new Map(indexMap));
        }
      }

      if (!cancelled) {
        setSearchScanning(false);
        setSearchScanProgress(null);
        setEpgSearchTitleByStreamId(new Map(indexMap));
      }
    })();

    return () => {
      cancelled = true;
      queueMicrotask(() => {
        setSearchScanning(false);
        setSearchScanProgress(null);
      });
    };
    // `nowPlayingMap` is read only for a snapshot when the query changes — omit from deps
    // so we don't restart a full EPG scan on every guide title tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional snapshot on query change
  }, [deferredQLower, scanCandidateIds, queryClient, creds]);

  const visible = useMemo(() => {
    let list = categoryFilteredStreams;
    const f = qLower;
    if (f) {
      list = list.filter((s) => {
        if (safeLower(s.name).includes(f)) return true;
        const np =
          nowPlayingMap.get(s.stream_id) ??
          epgSearchTitleByStreamId.get(s.stream_id);
        return np ? np.toLowerCase().includes(f) : false;
      });
    }
    return list;
  }, [
    categoryFilteredStreams,
    qLower,
    nowPlayingMap,
    epgSearchTitleByStreamId,
  ]);

  // Build the source for one channel.
  const toSource = useCallback(
    (c: LiveStream) => ({
      kind: "live" as const,
      id: c.stream_id,
      title: c.name,
      poster: c.stream_icon,
      url: buildLivePlayUrl(creds, c),
    }),
    [creds]
  );

  // Build the flip-playlist from whatever is currently visible. Cap to a
  // reasonable size so the playlist payload doesn't bloat for big providers.
  const openChannel = useCallback(
    (c: LiveStream) => {
      const items = visible.slice(0, 600).map(toSource);
      play(toSource(c), {
        playlist: { kind: "live", items },
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
    },
    [play, addRecent, toSource, visible]
  );

  const matchedByProgramCount = useMemo(() => {
    const f = qLower;
    if (!f) return 0;
    return visible.filter((s) => {
      const np =
        nowPlayingMap.get(s.stream_id) ??
        epgSearchTitleByStreamId.get(s.stream_id);
      return !safeLower(s.name).includes(f) && !!np && np.toLowerCase().includes(f);
    }).length;
  }, [visible, qLower, nowPlayingMap, epgSearchTitleByStreamId]);

  const selectedCategoryName = useMemo(() => {
    if (selected === "all") return "";
    const sid = String(selected);
    return (
      categoryNameById[sid] ||
      filteredCats.find((c) => String(c.category_id) === sid)?.category_name ||
      ""
    );
  }, [selected, categoryNameById, filteredCats]);

  /** Recently-watched live channels resolved to their full stream objects (for playback). */
  const liveRecentStreams = useMemo(() => {
    const streamById = new Map((streams.data || []).map((s) => [s.stream_id, s]));
    return recents
      .filter((r) => r.kind === "live")
      .map((r) => ({ recent: r, stream: streamById.get(r.id) }))
      .filter((x): x is { recent: (typeof recents)[0]; stream: NonNullable<typeof x.stream> } =>
        x.stream !== undefined
      )
      .slice(0, 12);
  }, [recents, streams.data]);

  /* ── TV-class browsers: Netflix-style horizontal shelves ── */
  if (tvBrowser) {
    return (
      <TvLiveBrowse
        categories={sortedFilteredCats}
        streams={categoryFilteredStreams}
        loading={streams.isLoading}
        creds={creds}
        openChannel={openChannel}
        isFavorite={(id) => isFavorite("live", id)}
        favorites={usePrefs.getState().favorites}
        nowPlayingMap={nowPlayingMap}
        reportNowPlaying={reportNowPlaying}
      />
    );
  }

  /* ── Web / mobile "All categories" browse: Netflix-style shelves ── */
  if (
    selected === "all" &&
    view === "list" &&
    !streams.isLoading &&
    sortedFilteredCats.length > 0
  ) {
    return (
      <div className="space-y-5">
        <SectionHeader
          hideDescriptionOnMobile
          eyebrow="Watch live"
          title="Live TV"
          description="Browse channels by category. Click any channel to start streaming instantly."
          right={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setCategoryBrowseOpen(true)}
                  className="lg:hidden inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl border border-(--line) bg-(--bg-2) text-xs font-medium text-(--text-dim) hover:text-(--text) hover:border-(--brand)/40 shrink-0"
                  aria-label="Open category browser"
                >
                  <Layers className="size-3.5" aria-hidden />
                  Categories
                </button>
                <ViewToggle view={view} setView={setViewMode} />
              </div>
              <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) focus-within:border-(--brand)/50 w-full sm:w-72 min-w-0">
                <Search className="size-4 text-(--text-muted) shrink-0" />
                <input
                  ref={liveSearchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search channels or programs…"
                  aria-label="Search channels or programs"
                  className="bg-transparent outline-none text-sm w-full placeholder:text-(--text-muted)"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="text-[11px] text-(--text-muted) hover:text-(--text)"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          }
        />
        <LiveCategoryBrowseModal
          open={categoryBrowseOpen}
          onClose={() => setCategoryBrowseOpen(false)}
          categories={sortedFilteredCats}
          value={selected}
          countById={countById}
          onChange={setCategory}
        />
        {liveRecentStreams.length > 0 && (
          <section>
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
                Pick up where you left off
              </p>
              <h2 className="text-base font-bold text-(--text)">Continue Watching</h2>
            </div>
            <div
              className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {liveRecentStreams.map(({ recent, stream }) => (
                <div key={recent.id} className="shrink-0 w-28 sm:w-32">
                  <LiveMediaCard
                    streamId={recent.id}
                    creds={creds}
                    title={recent.name}
                    poster={recent.icon}
                    posterFit="contain"
                    badge="Live"
                    onClick={() => openChannel(stream)}
                    isFavorite={isFavorite("live", recent.id)}
                    onToggleFavorite={() =>
                      toggleFavorite({
                        kind: "live",
                        id: recent.id,
                        name: recent.name,
                        icon: recent.icon,
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        )}
        <WebLiveBrowse
          categories={sortedFilteredCats}
          streams={categoryFilteredStreams}
          creds={creds}
          openChannel={openChannel}
          nowPlayingMap={nowPlayingMap}
          reportNowPlaying={reportNowPlaying}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        hideDescriptionOnMobile
        eyebrow="Watch live"
        title="Live TV"
        description={
          selected === "all"
            ? "Browse all live channels grouped by category. Click any channel to start streaming instantly."
            : `Showing channels in “${selectedCategoryName || "this category"}”. Use the sidebar or clear below to see everything again.`
        }
        right={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setCategoryBrowseOpen(true)}
                className="lg:hidden inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl border border-(--line) bg-(--bg-2) text-xs font-medium text-(--text-dim) hover:text-(--text) hover:border-(--brand)/40 shrink-0"
                aria-label="Open category browser"
              >
                <Layers className="size-3.5" aria-hidden />
                Categories
              </button>
              <ViewToggle view={view} setView={setViewMode} />
            </div>
            <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) focus-within:border-(--brand)/50 w-full sm:w-72 min-w-0">
              <Search className="size-4 text-(--text-muted) shrink-0" />
              <input
                ref={liveSearchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search channels or programs…"
                aria-label="Search channels or programs"
                className="bg-transparent outline-none text-sm w-full placeholder:text-(--text-muted)"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="text-[11px] text-(--text-muted) hover:text-(--text)"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        }
      />

      {!qTrim && liveRecentStreams.length > 0 && (
        <section>
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
              Pick up where you left off
            </p>
            <h2 className="text-base font-bold text-(--text)">Continue Watching</h2>
          </div>
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {liveRecentStreams.map(({ recent, stream }) => (
              <div key={recent.id} className="shrink-0 w-28 sm:w-32">
                <LiveMediaCard
                  streamId={recent.id}
                  creds={creds}
                  title={recent.name}
                  poster={recent.icon}
                  posterFit="contain"
                  badge="Live"
                  onClick={() => openChannel(stream)}
                  isFavorite={isFavorite("live", recent.id)}
                  onToggleFavorite={() =>
                    toggleFavorite({
                      kind: "live",
                      id: recent.id,
                      name: recent.name,
                      icon: recent.icon,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {qTrim && searchScanning && searchScanProgress && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="flex items-start gap-3 rounded-xl border border-(--line) bg-(--bg-2) px-3.5 py-3 sm:px-4"
        >
          <Loader2
            className="size-4 shrink-0 text-(--brand) animate-spin mt-0.5"
            aria-hidden
          />
          <div className="min-w-0 space-y-1 text-xs sm:text-sm">
            <p className="font-medium text-(--text)">
              Still searching programme titles
            </p>
            {programmeSearchCatchUp && (
              <p className="text-[11px] text-(--brand-2) leading-snug">
                Catching up to your typing — channel names in this view already
                filter live.
              </p>
            )}
            <p className="text-(--text-muted) text-pretty leading-relaxed">
              Scanning channels in{" "}
              <strong className="text-(--text)">
                {selected === "all" ? "this list" : `“${selectedCategoryName || "this category"}”`}
              </strong>{" "}
              that don&apos;t match your text as a channel name, prioritizing
              ones we already know are on-air (
              {searchScanProgress.examined.toLocaleString()} /{" "}
              {searchScanProgress.total.toLocaleString()}
              ). Matches appear as we go; pick a category to shrink the scan.
            </p>
          </div>
        </div>
      )}

      {!cats.isLoading && (
        <MobileCategoryRail
          categories={sortedFilteredCats}
          value={selected}
          onChange={setCategory}
          countById={countById}
          label="Browse"
        />
      )}

      {selected !== "all" && (
        <ActiveCategoryFilterBar
          categoryName={selectedCategoryName || "Selected category"}
          count={streams.isLoading ? undefined : visible.length}
          countLabel={
            visible.length === 1 ? "channel in view" : "channels in view"
          }
          onClear={() => setCategory("all")}
        />
      )}

      <LiveCategoryBrowseModal
        open={categoryBrowseOpen}
        onClose={() => setCategoryBrowseOpen(false)}
        categories={sortedFilteredCats}
        value={selected}
        countById={countById}
        onChange={setCategory}
      />

      <div className="grid grid-cols-12 gap-5">
        <div
          className={cn(
            "hidden lg:block col-span-12 lg:col-span-3 xl:col-span-3",
            tvBrowser && "!hidden"
          )}
        >
          {cats.isLoading ? (
            <div className="card p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-8 rounded-lg" />
              ))}
            </div>
          ) : (
            <CategoryPicker
              categories={sortedFilteredCats}
              value={selected}
              onChange={setCategory}
              countById={countById}
            />
          )}
        </div>

        <div
          className={cn(
            "col-span-12 lg:col-span-9 xl:col-span-9",
            tvBrowser && "lg:col-span-12 xl:col-span-12"
          )}
        >
          {streams.isLoading ? (
            <SkeletonGrid variant="tile" count={12} />
          ) : visible.length === 0 ? (
            qTrim && searchScanning ? (
              <div className="card p-10 sm:p-12 text-center">
                <p className="text-sm text-(--text-muted) text-pretty max-w-md mx-auto leading-relaxed">
                  No channel names match &ldquo;{qTrim}&rdquo; yet. Programme
                  matches will show here as they&apos;re found — see the status
                  banner above. Picking a category speeds this up.
                </p>
              </div>
            ) : (
              <Empty
                hasSearch={Boolean(q.trim())}
                categoryFiltered={selected !== "all"}
              />
            )
          ) : view === "guide" ? (
            <LiveGuide
              channels={visible}
              categoryNameById={categoryNameById}
              isFavorite={(id) => isFavorite("live", id)}
              onToggleFavorite={(c) =>
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
              onPlay={(c) => openChannel(c)}
            />
          ) : (
            <>
              {qTrim && programLookupTruncated && (
                <div className="mb-2 text-xs text-(--text-muted)">
                  On-air title search scans up to{" "}
                  {LIVE_SEARCH_MAX_SCAN_CHANNELS} channels (excluding name matches).
                  Pick a category or refine the query for broader coverage.
                </div>
              )}
              {qTrim && matchedByProgramCount > 0 && (
                <div className="mb-3 text-xs text-(--text-muted) space-y-1">
                  <p>
                    {matchedByProgramCount} match
                    {matchedByProgramCount === 1 ? "" : "es"} from on-air
                    programmes.
                  </p>
                  {searchScanning && (
                    <p className="flex items-center gap-1.5 text-(--text-dim)">
                      <Loader2
                        className="size-3 shrink-0 animate-spin"
                        aria-hidden
                      />
                      Still scanning — more may appear shortly.
                    </p>
                  )}
                </div>
              )}
              <VirtualLiveChannelGrid
                items={visible}
                maxItems={600}
                itemKey={(c) => c.stream_id}
                renderItem={(c) => (
                  <LiveChannelTile
                    streamId={c.stream_id}
                    categoryLine={categoryNameById[c.category_id]}
                    fallbackSubtitle={
                      categoryNameById[c.category_id] || undefined
                    }
                    number={c.num}
                    name={c.name}
                    icon={c.stream_icon}
                    isFavorite={isFavorite("live", c.stream_id)}
                    onNowPlaying={reportNowPlaying(c.stream_id)}
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
                    onClick={() => openChannel(c)}
                  />
                )}
                footer={
                  visible.length > 600 ? (
                    <div className="text-center text-xs text-(--text-muted) py-3">
                      Showing first 600 of {visible.length}. Use search or
                      categories to narrow down.
                    </div>
                  ) : null
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({
  hasSearch,
  categoryFiltered,
}: {
  hasSearch: boolean;
  categoryFiltered: boolean;
}) {
  const hint =
    hasSearch && categoryFiltered
      ? "Try clearing the search box or switching back to All categories."
      : hasSearch
        ? "Try clearing the search box."
        : categoryFiltered
          ? 'Try choosing "All" categories or pick a different group.'
          : null;

  return (
    <div className="card p-10 sm:p-12 flex flex-col items-center text-center gap-5">
      <div
        className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-(--brand)/22 via-(--bg-3) to-(--brand-2)/18 ring-1 ring-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]"
        aria-hidden
      >
        <Radio className="size-7 text-(--brand)" strokeWidth={1.75} />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-lg font-semibold text-(--text) tracking-tight text-balance">
          No channels match your filters
        </h2>
        <p className="text-sm text-(--text-dim) text-pretty">
          Adjust search or categories to see live channels in this view.
        </p>
        {hint && (
          <p className="text-xs text-(--text-muted) text-pretty pt-1">{hint}</p>
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  setView,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
}) {
  const items: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    { value: "list", label: "List", icon: <LayoutList className="size-3.5" /> },
    { value: "guide", label: "Guide", icon: <CalendarDays className="size-3.5" /> },
  ];
  return (
    <div
      className="flex items-center gap-1 p-1 rounded-xl bg-(--bg-2) border border-(--line) w-fit shrink-0"
      role="group"
      aria-label="Live layout"
    >
      {items.map((i) => (
        <button
          key={i.value}
          type="button"
          onClick={() => setView(i.value)}
          aria-label={`${i.label} view`}
          className={cn(
            "flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs transition-colors",
            view === i.value
              ? "bg-(--bg-3) text-(--text)"
              : "text-(--text-dim) hover:text-(--text)"
          )}
          aria-pressed={view === i.value}
        >
          {i.icon}
          {i.label}
        </button>
      ))}
    </div>
  );
}
