"use client";

import { inferCountryFromCategory } from "@/lib/channel-meta";
import type { EpgListingLike } from "@/lib/epg-time";
import {
  getBulkCachedEpgTitles,
  getCachedEpgTitle,
  setCachedEpgTitle,
} from "@/lib/epg-local-cache";
import { maxConcurrentEpgFetches } from "@/lib/epg-fetch-limiter";
import { nowPlayingTitleFromListings, SHORT_EPG_STALE_MS } from "@/lib/hooks";
import { runWithConcurrency } from "@/lib/run-with-concurrency";
import { proxiedCssBackground } from "@/lib/image-proxy";
import { prefetchLiveStreamManifest } from "@/lib/live-stream-prefetch";
import { buildLivePlayUrl, xtream } from "@/lib/xtream";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { VirtualLiveChannelGrid } from "@/components/VirtualMediaCatalogGrid";
import { LIVE_LIST_MAX_CHANNELS } from "@/lib/live-guide-limits";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, Radio, Search, X } from "lucide-react";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export type TvCategoryViewProps = {
  title: string;
  channels: LiveStream[];
  nowPlayingMap: Map<number, string>;
  activeStreamId?: number;
  onPlay: (c: LiveStream) => void;
  onBack: () => void;
  /** When supplied, the overlay self-scans EPG for visible channels on open. */
  creds?: XtreamCredentials;
  /** Category label for iptv-org region matching (e.g. "USA | Entertainment"). */
  categoryTitle?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How many channels to pre-scan on open */
const INITIAL_SCAN = 30;
/** How many extra channels to scan per scroll increment */
const SCAN_BATCH = 25;
/** Estimated row height in px (for scroll-to-batch calculations) */
const ROW_H_EST = 130;
/** Cap overlay list size — full categories freeze the main thread. */
const CATEGORY_VIEW_MAX_CHANNELS = LIVE_LIST_MAX_CHANNELS;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full-screen TV overlay: all channels in one category.
 *
 * EPG scanning:
 *   - Stage 1 (provider shortEPG): fast; runs for the first 30 channels on
 *     mount and for new batches as the user scrolls.
 *   - Stage 2 (external EPG via iptv-org): runs for channels that came back
 *     empty from Stage 1, when a country code can be inferred from the name.
 *
 * Search: "/" focuses the in-header search input; the list is filtered
 * against channel name + EPG title in real-time.
 */
export function TvCategoryView({
  title,
  channels,
  nowPlayingMap,
  activeStreamId,
  onPlay,
  onBack,
  creds,
  categoryTitle,
}: TvCategoryViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // ── EPG ────────────────────────────────────────────────────────────────
  /**
   * Seed localEpg from localStorage on the first render so previously-fetched
   * titles are available immediately — no API round-trip needed.
   */
  const [localEpg, setLocalEpg] = useState<Map<number, string>>(() => {
    if (!creds) return new Map();
    return getBulkCachedEpgTitles(
      creds.server,
      creds.username,
      channels.map((c) => c.stream_id)
    );
  });
  /**
   * IDs already submitted to a scan pass (so we never double-fetch).
   * Using a ref avoids a stale-closure problem in the scroll handler.
   */
  const scannedIdsRef = useRef<Set<number>>(new Set());
  /** Drives incremental scanning: marks how far into `channels` we have scanned. */
  const [scanUpTo, setScanUpTo] = useState(INITIAL_SCAN);

  // ── Search ──────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Filtered list ───────────────────────────────────────────────────────
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channels;
    const q = searchQuery.toLowerCase();
    return channels.filter((c) => {
      const nowPlaying =
        nowPlayingMap.get(c.stream_id) ?? localEpg.get(c.stream_id);
      return (
        c.name.toLowerCase().includes(q) ||
        nowPlaying?.toLowerCase().includes(q)
      );
    });
  }, [channels, searchQuery, nowPlayingMap, localEpg]);

  const displayChannels = useDeferredValue(filteredChannels);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement &&
          e.target.isContentEditable);
      if (e.key === "/" && !inField) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (inField) return;
      if (
        (e.key === "Escape" || e.key === "Backspace") &&
        !searchQuery
      ) {
        e.preventDefault();
        onBack();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onBack, searchQuery]);

  // ── Focus first/active channel on open ─────────────────────────────────
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = list.querySelectorAll<HTMLElement>("[data-tv-card-root]");
    const activeEl = activeStreamId
      ? Array.from(items).find(
          (el) => el.dataset.streamId === String(activeStreamId)
        )
      : null;
    (activeEl ?? items[0])?.focus();
  }, [activeStreamId]);

  // ── EPG scan function (kept in a ref, updated via effect) ─────────────
  /**
   * Two-stage EPG scan for a batch of channels:
   *   1. Provider shortEPG (fast)
   *   2. External EPG (iptv-org) for channels that came back empty
   *
   * The function is stored in a ref so the initial-scan and scroll-scan
   * effects can call it without listing every closure dependency.
   * The ref is populated inside a useEffect (not during render) so the
   * React Compiler's "no ref access during render" rule is satisfied.
   */
  const scanFnRef = useRef<(batch: LiveStream[]) => Promise<void>>(
    async () => {}
  );
  useEffect(() => {
    scanFnRef.current = async (batch) => {
      if (!creds) return;
      const nowSec = Math.floor(Date.now() / 1000);

      // Filter to truly un-scanned channels. Skip those already in localStorage.
      const toScan = batch.filter((c) => {
        if (scannedIdsRef.current.has(c.stream_id)) return false;
        if (nowPlayingMap.has(c.stream_id)) return false;
        // If localStorage already has a fresh title, populate localEpg directly
        // and skip the API call.
        const cached = getCachedEpgTitle(
          creds.server,
          creds.username,
          c.stream_id
        );
        if (cached) {
          setLocalEpg((prev) => new Map(prev).set(c.stream_id, cached));
          scannedIdsRef.current.add(c.stream_id);
          return false;
        }
        return true;
      });
      if (toScan.length === 0) return;

      const categoryLine = categoryTitle?.trim() ?? "";

      // ── Stage 1: Provider shortEPG ──────────────────────────────────────
      const noProviderEpg: LiveStream[] = [];
      await runWithConcurrency(
        toScan,
        maxConcurrentEpgFetches(),
        async (c) => {
          try {
            const data = await queryClient.fetchQuery({
              queryKey: [
                "short-epg",
                creds.server,
                creds.username,
                c.stream_id,
                2,
              ],
              queryFn: ({ signal }) =>
                xtream.shortEPG(creds, c.stream_id, 2, signal),
              staleTime: SHORT_EPG_STALE_MS,
              retry: false,
            });
            const epgTitle = nowPlayingTitleFromListings(
              data?.epg_listings ?? [],
              nowSec
            );
            if (epgTitle) {
              setCachedEpgTitle(creds.server, creds.username, c.stream_id, epgTitle);
              setLocalEpg((prev) => new Map(prev).set(c.stream_id, epgTitle));
              scannedIdsRef.current.add(c.stream_id);
            } else {
              noProviderEpg.push(c);
            }
          } catch {
            noProviderEpg.push(c);
          }
        }
      );

      // ── Stage 2: External EPG fallback (iptv-org) ───────────────────────
      if (noProviderEpg.length === 0) return;
      await Promise.all(
        noProviderEpg.map(async (c) => {
          try {
            const country =
              inferCountryFromCategory(categoryLine) ||
              inferCountryFromCategory(c.name);
            if (!country) return;
            const params = new URLSearchParams({
              name: c.name,
              country,
              limit: "3",
            });
            const res = await fetch(`/api/external-epg?${params.toString()}`);
            if (!res.ok) return;
            const data = (await res.json()) as {
              epg_listings?: EpgListingLike[];
            };
            const epgTitle = nowPlayingTitleFromListings(
              data.epg_listings ?? [],
              nowSec
            );
            if (epgTitle) {
              setCachedEpgTitle(creds.server, creds.username, c.stream_id, epgTitle);
              setLocalEpg((prev) => new Map(prev).set(c.stream_id, epgTitle));
            }
          } catch {
            /* silent */
          } finally {
            scannedIdsRef.current.add(c.stream_id);
          }
        })
      );
    };
  }, [creds, queryClient, nowPlayingMap, categoryTitle]);

  const channelsFingerprint = useMemo(() => {
    if (channels.length === 0) return "";
    const n = Math.min(channels.length, 80);
    let h = `${channels.length}|`;
    for (let i = 0; i < n; i++) h += `${channels[i]!.stream_id},`;
    return h;
  }, [channels]);

  useEffect(() => {
    if (!channelsFingerprint) return;
    scannedIdsRef.current = new Set();
    lastScanUpToRef.current = 0;
    setScanUpTo(INITIAL_SCAN);
  }, [channelsFingerprint]);

  useEffect(() => {
    if (!channelsFingerprint) return;
    void scanFnRef.current(channels.slice(0, INITIAL_SCAN));
  }, [channelsFingerprint, channels]);

  // ── Incremental EPG scan as scanUpTo grows ──────────────────────────────
  // lastScanUpToRef ensures we only scan new territory when scanUpTo advances.
  const lastScanUpToRef = useRef(0);
  useEffect(() => {
    if (scanUpTo <= lastScanUpToRef.current) return;
    const start = Math.max(lastScanUpToRef.current, INITIAL_SCAN);
    lastScanUpToRef.current = scanUpTo;
    if (start >= scanUpTo) return;
    void scanFnRef.current(channels.slice(start, scanUpTo));
  }, [channels, scanUpTo]);

  // ── Scroll handler: expand scan window ─────────────────────────────────
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScroll = useCallback(() => {
    if (!creds) return;
    const list =
      listRef.current?.querySelector<HTMLElement>(".live-channel-scroll") ??
      listRef.current;
    if (!list) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      const cols = window.innerWidth >= 1280 ? 2 : 1;
      const visibleBottomChannel =
        Math.ceil((list.scrollTop + list.clientHeight) / ROW_H_EST) * cols;
      setScanUpTo((prev) => {
        if (visibleBottomChannel + 10 > prev && prev < channels.length) {
          return Math.min(prev + SCAN_BATCH, channels.length);
        }
        return prev;
      });
    }, 200);
  }, [creds, channels.length]);

  useEffect(() => {
    const list =
      listRef.current?.querySelector<HTMLElement>(".live-channel-scroll");
    if (!list) return;
    list.addEventListener("scroll", handleScroll, { passive: true });
    return () => list.removeEventListener("scroll", handleScroll);
  }, [handleScroll, displayChannels.length]);

  const getNowPlaying = (id: number) =>
    nowPlayingMap.get(id) ?? localEpg.get(id);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: "rgba(5,5,10,0.98)" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/8 shrink-0">
        {/* Back button */}
        <button
          type="button"
          data-tv-card-root
          onClick={onBack}
          className="flex items-center justify-center size-12 rounded-xl border border-white/12 bg-white/6 text-white/60 hover:text-white hover:bg-white/12 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="size-6" />
        </button>

        {/* Title + count */}
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl xl:text-3xl font-bold text-white truncate leading-tight">
            {title}
          </h2>
          <p className="text-sm text-white/35 mt-0.5">
            {filteredChannels.length !== channels.length
              ? `${filteredChannels.length} of ${channels.length} channels`
              : `${channels.length} channel${channels.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2.5 bg-white/6 border border-white/10 rounded-xl px-3.5 py-2.5 min-w-0">
          <Search className="size-4 text-white/40 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channels…"
            aria-label="Filter channels"
            className="bg-transparent text-white placeholder-white/30 text-sm outline-none w-36 xl:w-52"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-white/35 hover:text-white/70 transition-colors shrink-0"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Channel list ── */}
      <div ref={listRef} className="flex-1 min-h-0 px-5 py-3 flex flex-col">
        {filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-white/30 select-none">
            <Search className="size-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">
              No channels match &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        ) : (
          <VirtualLiveChannelGrid
            items={displayChannels}
            maxItems={CATEGORY_VIEW_MAX_CHANNELS}
            scrollMaxHeight="calc(100dvh - 7.5rem)"
            scrollClassName="flex-1 border-0 bg-transparent rounded-none"
            itemKey={(c) => c.stream_id}
            footer={
              displayChannels.length > CATEGORY_VIEW_MAX_CHANNELS ? (
                <p className="px-2 py-3 text-center text-xs text-white/45">
                  Showing first {CATEGORY_VIEW_MAX_CHANNELS.toLocaleString()} of{" "}
                  {displayChannels.length.toLocaleString()} channels — refine search
                  to narrow the list.
                </p>
              ) : null
            }
            renderItem={(c) => (
              <ChannelRow
                channel={c}
                nowPlaying={getNowPlaying(c.stream_id)}
                active={c.stream_id === activeStreamId}
                onPlay={onPlay}
                creds={creds}
              />
            )}
          />
        )}
      </div>

      {/* ── Footer hints ── */}
      <div className="shrink-0 px-6 py-2.5 border-t border-white/6 flex items-center gap-5 text-xs text-white/25 select-none">
        <span>↑ ↓ &nbsp;navigate</span>
        <span>↵ &nbsp;play</span>
        <span>⌫ &nbsp;back</span>
        <span>/ &nbsp;search</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChannelRow — sofa-distance optimised (3 m viewing)
// ---------------------------------------------------------------------------

type ChannelRowProps = {
  channel: LiveStream;
  nowPlaying?: string;
  active: boolean;
  onPlay: (c: LiveStream) => void;
  creds?: XtreamCredentials;
};

const ChannelRow = memo(
  function ChannelRow({
    channel,
    nowPlaying,
    active,
    onPlay,
    creds,
  }: ChannelRowProps) {
    const rowRef = useRef<HTMLDivElement>(null);
    const iconBg = proxiedCssBackground(channel.stream_icon, creds?.server);

    return (
      <div
        ref={rowRef}
        data-tv-card-root
        data-stream-id={channel.stream_id}
        tabIndex={0}
        role="button"
        aria-label={`Play ${channel.name}${nowPlaying ? ` — ${nowPlaying}` : ""}`}
        onClick={() => onPlay(channel)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPlay(channel);
          }
        }}
        onFocus={() => {
          rowRef.current?.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
          if (creds) {
            prefetchLiveStreamManifest(buildLivePlayUrl(creds, channel));
          }
        }}
        onPointerEnter={() => {
          if (creds) {
            prefetchLiveStreamManifest(buildLivePlayUrl(creds, channel));
          }
        }}
        className={[
          "group flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer select-none outline-none transition-all duration-100",
          active
            ? "bg-purple-600/20 border border-purple-400/45 shadow-[0_0_0_1px_rgba(167,139,250,0.2)]"
            : "border border-transparent hover:bg-white/7 hover:border-white/12 focus-visible:bg-white/8 focus-visible:border-purple-400/55 focus-visible:shadow-[0_0_0_2px_rgba(167,139,250,0.4)]",
        ].join(" ")}
      >
        {/* Logo — 80 px. Initials as base; channel logo via CSS background-image. */}
        <div className="size-20 rounded-xl overflow-hidden shrink-0 relative">
          <div className="absolute inset-0 bg-white/5 flex items-center justify-center">
            <LogoInitials name={channel.name} />
          </div>
          {iconBg && (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage: iconBg,
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                backgroundOrigin: "content-box",
                padding: "8px",
              }}
            />
          )}
        </div>

        {/* Text: channel number + name + EPG */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Channel number — shown when provider supplies one */}
            {channel.num > 0 && (
              <span className="shrink-0 text-xs font-mono text-white/30 w-8 text-right">
                {channel.num}
              </span>
            )}
            {/* text-xl = 20px → 25px at 125% zoom — clear at 3 m */}
            <p className="text-xl font-bold text-white truncate leading-snug">
              {channel.name}
            </p>
          </div>

          {nowPlaying ? (
            /* text-base = 16px → 20px at 125% zoom */
            <p className="text-base text-purple-300/85 truncate mt-1 leading-snug">
              {nowPlaying}
            </p>
          ) : (
            /* Styled "LIVE" chip instead of a bare dot + text */
            <div className="mt-1">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/12 border border-red-500/25 text-xs font-semibold text-red-400/80 uppercase tracking-wider">
                <span className="size-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                Live
              </span>
            </div>
          )}
        </div>

        {/* Play chevron — appears on hover/focus */}
        <div className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
          <div className="size-11 rounded-full bg-purple-500/25 border border-purple-400/35 flex items-center justify-center">
            <Play className="size-5 text-purple-300 fill-current ml-0.5" />
          </div>
        </div>

        {/* NOW PLAYING indicator */}
        {active && (
          <Radio className="size-5 text-purple-400 animate-pulse shrink-0" />
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.channel.stream_id === next.channel.stream_id &&
    prev.channel.stream_icon === next.channel.stream_icon &&
    prev.channel.num === next.channel.num &&
    prev.nowPlaying === next.nowPlaying &&
    prev.active === next.active
);

// ---------------------------------------------------------------------------
// Logo initials fallback — deterministic colour derived from name hash
// ---------------------------------------------------------------------------

function LogoInitials({ name }: { name: string }) {
  const clean =
    name
      .replace(/^\[.*?\]\s*/, "")
      .replace(/^[A-Z]{2,4}\s*[\|:]\s*/i, "")
      .trim() || name;
  const words = clean.split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? (words[0]![0]! + words[1]![0]!).toUpperCase()
      : clean.substring(0, 2).toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: `hsl(${hue},35%,18%)` }}
    >
      <span
        className="text-xl font-bold"
        style={{ color: `hsl(${hue},55%,70%)` }}
      >
        {initials}
      </span>
    </div>
  );
}
