"use client";

import { useTvBrowser } from "@/components/TvBrowserProvider";
import {
  GUIDE_VIEWPORT_PAD_SEC,
  epgProgramRangeUnixSec,
} from "@/lib/epg-time";
import {
  decodeEpgText,
  useGuideChannelEPG,
  useInViewWithin,
  useNow,
} from "@/lib/hooks";
import {
  inferCountryFromCategory,
  parseChannelMeta,
} from "@/lib/channel-meta";
import { isLiveGuideEpgEnabled } from "@/lib/live-epg-policy";
import { LIVE_GUIDE_MAX_CHANNELS } from "@/lib/live-guide-limits";
import { cn } from "@/lib/utils";
import { buildImageProxy } from "@/lib/xtream";
import type { LiveStream } from "@/lib/xtream-types";
import {
  useVirtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, ChevronUp, Heart, Play, Radio } from "lucide-react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PX_PER_MIN = 4; // 30 min slot = 120px wide
const SLOT_MIN = 30;
const SLOT_PX = SLOT_MIN * PX_PER_MIN; // 120
/** CSS repeating gradient for half-hour slot lines (replaces 24 DOM nodes per row). */
/** One gradient replaces 24 absolutely positioned divs per row (major scroll win). */
const SLOT_GRID_STYLE: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent ${SLOT_PX - 1}px,
    color-mix(in oklab, var(--line) 50%, transparent) ${SLOT_PX - 1}px,
    color-mix(in oklab, var(--line) 50%, transparent) ${SLOT_PX}px
  )`,
};
/** Taller rows so channel titles can wrap (providers often put events in the name). */
const ROW_PX = 108;
const HEADER_PX = 38;
const CHANNEL_COL_PX = 336;
const TOTAL_HOURS = 12;
type Props = {
  channels: LiveStream[];
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (c: LiveStream) => void;
  onPlay: (c: LiveStream) => void;
  /** Optional cap (e.g. debugging). Default: all channels via virtualized rows. */
  channelLimit?: number;
  /** Maps category_id → category_name for EPG region hints. */
  categoryNameById?: Record<string, string>;
};

function fmtClock(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LiveGuide({
  channels,
  isFavorite,
  onToggleFavorite,
  onPlay,
  channelLimit,
  categoryNameById,
}: Props) {
  const now = useNow(60_000);
  const tvBrowser = useTvBrowser();
  // Anchor: round "now" down to the previous half-hour, then start the
  // viewport 30 min before that so users can see what just aired.
  const anchor = useMemo(() => {
    const halfHour = SLOT_MIN * 60;
    const rounded = Math.floor(now / halfHour) * halfHour;
    return rounded - halfHour;
  }, [now]);

  const effectiveLimit = channelLimit ?? LIVE_GUIDE_MAX_CHANNELS;

  const visibleChannels = useMemo(
    () => channels.slice(0, effectiveLimit),
    [channels, effectiveLimit]
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollRootEl, setScrollRootEl] = useState<HTMLDivElement | null>(null);
  const setScrollerNode = useCallback((node: HTMLDivElement | null) => {
    scrollerRef.current = node;
    setScrollRootEl(node);
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: visibleChannels.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_PX,
    /** Fewer off-screen rows = fewer EPG hooks + lighter scroll. */
    overscan: 2,
    getItemKey: (index) =>
      visibleChannels[index]?.stream_id ?? `idx:${index}`,
  });

  const totalMinutes = TOTAL_HOURS * 60;
  const totalWidth = totalMinutes * PX_PER_MIN;

  const slots = useMemo(() => {
    const out: number[] = [];
    for (let m = 0; m < totalMinutes; m += SLOT_MIN) out.push(anchor + m * 60);
    return out;
  }, [anchor, totalMinutes]);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nowOffsetMin = (now - anchor) / 60;
    const target = Math.max(0, nowOffsetMin * PX_PER_MIN - 220);
    el.scrollTo({ left: target, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.length]);

  const jumpToNow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nowOffsetMin = (now - anchor) / 60;
    el.scrollTo({
      left: Math.max(0, nowOffsetMin * PX_PER_MIN - 220),
      behavior: "smooth",
    });
  }, [now, anchor]);

  const onGuideScrollerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const el = scrollerRef.current;
      if (!el) return;
      const stepX = SLOT_PX * 2;
      const stepY = ROW_PX * 2;
      const beh: ScrollBehavior = "smooth";
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        el.scrollBy({ left: -stepX, behavior: beh });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        el.scrollBy({ left: stepX, behavior: beh });
      } else if (e.key === "Home") {
        e.preventDefault();
        el.scrollTo({ left: 0, behavior: beh });
      } else if (e.key === "End") {
        e.preventDefault();
        el.scrollTo({ left: el.scrollWidth, behavior: beh });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        el.scrollBy({ top: -stepY, behavior: beh });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        el.scrollBy({ top: stepY, behavior: beh });
      } else if (e.key === "PageUp") {
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight * 0.9, behavior: beh });
      } else if (e.key === "PageDown") {
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight * 0.9, behavior: beh });
      }
    },
    []
  );

  /**
   * TV browsers often run spatial-navigation in the capture phase, which
   * moves focus BEFORE bubbled React events can fire. Attaching a capture-
   * phase native listener on the scroller lets us preventDefault *first*,
   * keeping ArrowUp/Down inside the guide and stopping focus from escaping
   * upward to the Live-TV header controls.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !tvBrowser) return;

    const stepX = SLOT_PX * 2;
    const stepY = ROW_PX * 2;

    const handleCapture = (e: globalThis.KeyboardEvent) => {
      if (!el.contains(document.activeElement) && document.activeElement !== el)
        return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          el.scrollBy({ top: -stepY, behavior: "auto" });
          break;
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          el.scrollBy({ top: stepY, behavior: "auto" });
          break;
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          el.scrollBy({ left: -stepX, behavior: "auto" });
          break;
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          el.scrollBy({ left: stepX, behavior: "auto" });
          break;
        case "PageUp":
          e.preventDefault();
          e.stopPropagation();
          el.scrollBy({ top: -el.clientHeight * 0.9, behavior: "auto" });
          break;
        case "PageDown":
          e.preventDefault();
          e.stopPropagation();
          el.scrollBy({ top: el.clientHeight * 0.9, behavior: "auto" });
          break;
      }
    };

    el.addEventListener("keydown", handleCapture, true);
    return () => el.removeEventListener("keydown", handleCapture, true);
  }, [tvBrowser]);

  const nowLineLeft = ((now - anchor) / 60) * PX_PER_MIN;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-(--line) bg-(--bg-2)">
        <div className="text-xs text-(--text-dim)">
          {channels.length > effectiveLimit ? (
            <>
              Showing {visibleChannels.length} of {channels.length} channels ·{" "}
            </>
          ) : (
            <>
              {visibleChannels.length} channels ·{" "}
            </>
          )}
          {TOTAL_HOURS}-hr window
        </div>
        <div className="flex items-center gap-2">
          {tvBrowser && (
            <>
              <button
                type="button"
                aria-label="Scroll guide up"
                onClick={() => {
                  const el = scrollerRef.current;
                  if (el) el.scrollBy({ top: -(ROW_PX * 4), behavior: "auto" });
                }}
                className="h-8 w-8 rounded-xl text-[11px] font-semibold bg-(--bg-3) hover:bg-(--bg-3)/90 text-(--text-dim) hover:text-(--text) border border-(--line) hover:border-(--brand)/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/45 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-2) active:scale-[0.98] grid place-items-center"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Scroll guide down"
                onClick={() => {
                  const el = scrollerRef.current;
                  if (el) el.scrollBy({ top: ROW_PX * 4, behavior: "auto" });
                }}
                className="h-8 w-8 rounded-xl text-[11px] font-semibold bg-(--bg-3) hover:bg-(--bg-3)/90 text-(--text-dim) hover:text-(--text) border border-(--line) hover:border-(--brand)/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/45 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-2) active:scale-[0.98] grid place-items-center"
              >
                <ChevronDown className="size-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={jumpToNow}
            className="h-8 px-3 rounded-xl text-[11px] font-semibold bg-(--bg-3) hover:bg-(--bg-3)/90 text-(--text-dim) hover:text-(--text) border border-(--line) hover:border-(--brand)/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/45 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-2) active:scale-[0.98]"
          >
            Jump to Now
          </button>
        </div>
      </div>

      <div
        ref={setScrollerNode}
        role="region"
        aria-label="Program guide timeline"
        tabIndex={0}
        onKeyDown={onGuideScrollerKeyDown}
        className={cn(
          "relative overflow-auto overscroll-x-contain overscroll-y-contain outline-none touch-pan-x touch-pan-y",
          tvBrowser &&
            "overflow-y-scroll scroll-auto [scroll-behavior:auto]",
          "focus-visible:ring-2 focus-visible:ring-(--brand)/45 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-1)"
        )}
        style={{
          maxHeight: tvBrowser
            ? "min(72dvh, calc(100dvh - 9rem))"
            : "calc(100vh - 280px)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          className="relative"
          style={{
            width: CHANNEL_COL_PX + totalWidth,
            height: HEADER_PX + rowVirtualizer.getTotalSize(),
          }}
        >
          {/* Sticky time header */}
          <div
            className="sticky top-0 z-30 flex bg-(--bg-2) border-b border-(--line)"
            style={{ height: HEADER_PX }}
          >
            <div
              className="sticky left-0 z-40 bg-(--bg-2) border-r border-(--line) flex items-center px-3 text-[11px] uppercase tracking-wider text-(--text-muted) font-semibold"
              style={{ width: CHANNEL_COL_PX, minWidth: CHANNEL_COL_PX }}
            >
              Channel
            </div>
            <div className="relative" style={{ width: totalWidth }}>
              {slots.map((unix, i) => {
                const isHourMark = i % 2 === 0;
                return (
                  <div
                    key={unix}
                    className={cn(
                      "absolute top-0 h-full flex items-center border-l overflow-hidden",
                      isHourMark
                        ? "border-(--line)"
                        : "border-(--line)/30"
                    )}
                    style={{ left: i * SLOT_PX, width: SLOT_PX }}
                  >
                    <span
                      className={cn(
                        "ml-2 mr-2 text-[11px] tabular-nums truncate min-w-0",
                        isHourMark
                          ? "text-(--text-dim) font-semibold"
                          : "text-(--text-muted)/70 font-normal"
                      )}
                    >
                      {fmtClock(unix)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Now line */}
          <div
            className="absolute top-0 z-20 pointer-events-none"
            style={{
              left: CHANNEL_COL_PX + nowLineLeft,
              height: HEADER_PX + rowVirtualizer.getTotalSize(),
            }}
          >
            <div className="w-px h-full bg-(--brand) opacity-80" />
            <div className="absolute -top-1 -translate-x-1/2 left-0 h-2 w-2 rounded-full bg-(--brand) shadow-[0_0_10px_rgba(124,92,255,0.7)]" />
          </div>

          <div
            className="relative"
            style={{ height: rowVirtualizer.getTotalSize() }}
            role="grid"
            aria-label="Live TV schedule"
            aria-rowcount={visibleChannels.length}
          >
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const c = visibleChannels[vi.index]!;
              return (
                <GuideRow
                  key={vi.key}
                  virtualRow={vi}
                  scrollRoot={scrollRootEl}
                  measureElement={rowVirtualizer.measureElement}
                  channel={c}
                  anchor={anchor}
                  now={now}
                  totalWidth={totalWidth}
                  categoryLabel={categoryNameById?.[c.category_id]}
                  isFavorite={isFavorite(c.stream_id)}
                  onToggleFavorite={onToggleFavorite}
                  onPlay={onPlay}
                />
              );
            })}
          </div>
        </div>
      </div>

      {channels.length > effectiveLimit && (
        <div className="px-3 py-2 text-[11px] text-(--text-muted) border-t border-(--line) bg-(--bg-2)">
          Showing first {effectiveLimit}. Use category filters or search above to
          focus on specific channels.
        </div>
      )}
    </div>
  );
}

function GuideRow({
  virtualRow,
  scrollRoot,
  measureElement,
  channel,
  anchor,
  now,
  totalWidth,
  categoryLabel,
  isFavorite,
  onToggleFavorite,
  onPlay,
}: {
  virtualRow: VirtualItem;
  scrollRoot: HTMLElement | null;
  measureElement: (el: Element | null) => void;
  channel: LiveStream;
  anchor: number;
  now: number;
  totalWidth: number;
  categoryLabel?: string;
  isFavorite: boolean;
  onToggleFavorite: (c: LiveStream) => void;
  onPlay: (c: LiveStream) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const iconSrc = buildImageProxy(channel.stream_icon);
  const [ioRef, rowInScrollport] = useInViewWithin<HTMLDivElement>(
    scrollRoot,
    "64px 0px 200px 0px"
  );
  const guideEpgOn = isLiveGuideEpgEnabled();

  const country = useMemo(() => {
    const fromCat = categoryLabel
      ? inferCountryFromCategory(categoryLabel)
      : undefined;
    return fromCat ?? parseChannelMeta(channel.name).countryCode;
  }, [categoryLabel, channel.name]);

  const viewportSec = useMemo(() => {
    const windowEnd = anchor + TOTAL_HOURS * 3600;
    return {
      lo: anchor - GUIDE_VIEWPORT_PAD_SEC,
      hi: windowEnd + GUIDE_VIEWPORT_PAD_SEC,
    };
  }, [anchor]);

  const {
    programs: allPrograms,
    isLoading,
    isResolved,
    sourceIsExternal,
  } = useGuideChannelEPG({
    streamId: channel.stream_id,
    channelName: channel.name,
    country,
    viewportSec,
    epgEnabled: guideEpgOn && rowInScrollport,
  });

  const programs = useMemo(() => {
    return allPrograms.filter((p) => {
      const r = epgProgramRangeUnixSec(p);
      if (!r) return false;
      return r.end > viewportSec.lo && r.start < viewportSec.hi;
    });
  }, [allPrograms, viewportSec]);

  const showEpgLoading = guideEpgOn && isLoading;
  const noEpg =
    (guideEpgOn ? isResolved : true) && programs.length === 0 && !showEpgLoading;

  const setRowNode = useCallback(
    (el: HTMLDivElement | null) => {
      ioRef.current = el;
      measureElement(el);
    },
    [ioRef, measureElement]
  );

  return (
    <div
      role="row"
      aria-rowindex={virtualRow.index + 1}
      ref={setRowNode}
      data-index={virtualRow.index}
      className="absolute left-0 w-full flex border-b border-(--line)/60 hover:bg-(--bg-2)/50 transition-colors overflow-hidden"
      style={{
        top: virtualRow.start,
        height: virtualRow.size,
        minHeight: ROW_PX,
      }}
    >
      {/* Sticky channel column */}
      <div
        className="sticky left-0 z-10 bg-(--bg-1) border-r border-(--line) flex items-start gap-3 px-3 py-2 self-stretch"
        style={{ width: CHANNEL_COL_PX, minWidth: CHANNEL_COL_PX }}
      >
        <button
          type="button"
          onClick={() => onPlay(channel)}
          className={cn(
            "size-10 shrink-0 rounded-xl bg-(--bg-3) border overflow-hidden grid place-items-center transition-all mt-0.5",
            "border-(--line) hover:border-(--brand)/45 hover:shadow-[0_0_0_1px_rgba(124,92,255,0.2),0_8px_20px_rgba(124,92,255,0.08)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-1) active:scale-[0.97]",
            noEpg &&
              "ring-2 ring-(--brand)/25 ring-offset-2 ring-offset-(--bg-1) border-(--brand)/35"
          )}
          aria-label={`Play ${channel.name}`}
        >
          {!imgErr && iconSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={iconSrc}
              onError={() => setImgErr(true)}
              alt=""
              loading="lazy"
              className="size-full object-contain p-1"
            />
          ) : (
            <Radio className="size-4 text-(--text-muted)" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="text-[10px] font-mono text-(--text-muted) tabular-nums leading-none">
              CH {channel.num}
            </div>
            {sourceIsExternal && (
              <span
                title="Schedule via iptv-org public EPG"
                className="text-[8px] font-semibold uppercase tracking-wider px-1 py-px rounded bg-(--brand-2)/15 border border-(--brand-2)/30 text-(--brand-2) leading-none"
              >
                iptv-org
              </span>
            )}
          </div>
          <button
            type="button"
            title={channel.name}
            onClick={() => onPlay(channel)}
            className={cn(
              "w-full text-left font-medium text-(--text) leading-snug mt-0.5 break-words rounded-lg -mx-1 px-1 py-0.5 -my-0.5 transition-colors hover:bg-(--bg-3)/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50",
              noEpg ? "text-[11px] line-clamp-3" : "text-[12px] line-clamp-2"
            )}
          >
            {channel.name}
          </button>
        </div>
        <button
          type="button"
          aria-label="Toggle favorite"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(channel);
          }}
          className={cn(
            "size-7 rounded-lg grid place-items-center transition-colors shrink-0 mt-0.5",
            isFavorite
              ? "text-(--danger)"
              : "text-(--text-muted) hover:text-(--text)"
          )}
        >
          <Heart className={cn("size-4", isFavorite && "fill-current")} />
        </button>
      </div>

      {/* Program lane */}
      <div className="relative" style={{ width: totalWidth }}>
        <div
          className="absolute inset-0 pointer-events-none opacity-90"
          style={SLOT_GRID_STYLE}
          aria-hidden
        />

        {showEpgLoading && (
          <div className="absolute inset-y-2 left-2 right-2 rounded-lg skeleton" />
        )}

        {noEpg && !showEpgLoading && (
          <button
            type="button"
            onClick={() => onPlay(channel)}
            title={channel.name}
            aria-label={`Play live: ${channel.name}`}
            className={cn(
              "absolute inset-y-1.5 left-2 right-2 flex items-center gap-3 rounded-xl px-3 py-2 text-left overflow-hidden",
              "guide-no-epg-play border border-(--brand)/35 bg-gradient-to-r from-(--brand)/14 via-(--bg-3) to-(--brand-2)/10",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_6px_24px_rgba(0,0,0,0.35)]",
              "hover:border-(--brand)/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_10px_32px_rgba(124,92,255,0.15)]",
              "hover:from-(--brand)/20 hover:via-(--bg-3) hover:to-(--brand-2)/14",
              "active:scale-[0.997] transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-1)",
              "cursor-pointer group/play-strip"
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--brand)/22 text-(--brand) shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-white/10 group-hover/play-strip:bg-(--brand)/30 transition-colors">
              <Play className="size-4 fill-current opacity-95" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 flex flex-col gap-0.5">
              <span className="text-[12px] font-semibold text-(--text) leading-snug tracking-tight">
                Play live stream
              </span>
              <span className="text-[10px] text-(--text-muted) leading-snug">
                No TV guide for this channel · uses playlist title on the left
              </span>
            </span>
            <ChevronRight
              className="size-5 shrink-0 text-(--text-muted) opacity-70 group-hover/play-strip:text-(--brand-2) group-hover/play-strip:opacity-100 transition-colors translate-x-0 group-hover/play-strip:translate-x-0.5"
              aria-hidden
            />
          </button>
        )}

        {!isLoading &&
          programs.map((p) => {
            const range = epgProgramRangeUnixSec(p);
            if (!range) return null;
            const { start, end } = range;
            const rawLeft = ((start - anchor) / 60) * PX_PER_MIN;
            const rawRight = ((end - anchor) / 60) * PX_PER_MIN;
            // Inset every block by 2px on each side so adjacent blocks don't
            // visually merge into each other.
            const GAP = 2;
            const left = Math.max(0, rawLeft) + GAP;
            const right = Math.min(totalWidth, rawRight) - GAP;
            const width = Math.max(6, right - left);
            const isCurrent = start <= now && now < end;
            const isPast = end <= now;
            const title = decodeEpgText(p.title);
            // Decide content density based on width.
            const showText = width >= 56;
            const showStartTime = width >= 110;
            const showPlayIcon = width >= 90 && isCurrent;
            return (
              <button
                key={p.id || `${start}-${end}`}
                onClick={() => onPlay(channel)}
                title={`${title}\n${fmtClock(start)} – ${fmtClock(end)}`}
                className={cn(
                  "absolute top-1.5 bottom-1.5 rounded-lg text-left overflow-hidden text-[12px] transition-colors border",
                  showText ? "px-2" : "px-0",
                  isCurrent
                    ? "bg-(--brand)/20 border-(--brand)/60 text-(--text) hover:bg-(--brand)/30 shadow-[0_0_0_1px_rgba(124,92,255,0.15)]"
                    : isPast
                    ? "bg-(--bg-2) border-(--line)/60 text-(--text-muted) hover:bg-(--bg-3)"
                    : "bg-(--bg-3) border-(--line) text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
                )}
                style={{ left, width }}
              >
                {showText ? (
                  <div className="flex items-center gap-1.5 h-full">
                    {isCurrent && (
                      <span className="size-1.5 rounded-full bg-(--danger) shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.55)]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium leading-tight">
                        {title}
                      </div>
                      {showStartTime && (
                        <div className="text-[10px] tabular-nums opacity-70 truncate leading-tight mt-px">
                          {fmtClock(start)} – {fmtClock(end)}
                        </div>
                      )}
                    </div>
                    {showPlayIcon && (
                      <Play className="size-3 fill-current opacity-70 shrink-0" />
                    )}
                  </div>
                ) : (
                  // For very narrow blocks: just a colored swatch with a tiny
                  // "now" dot if it's current. Title is in the tooltip.
                  <div className="h-full grid place-items-center">
                    {isCurrent && (
                      <span className="size-1.5 rounded-full bg-(--danger) shadow-[0_0_6px_rgba(239,68,68,0.55)]" />
                    )}
                  </div>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
