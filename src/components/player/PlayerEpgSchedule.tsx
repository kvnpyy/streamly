"use client";

import { decodeEpgText } from "@/lib/hooks";
import {
  type EpgListingLike,
  epgProgramRangeUnixSec,
} from "@/lib/epg-time";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";

export type PlayerEpgListing = EpgListingLike & {
  id: string | number;
  title?: string;
  description?: string;
};

export type PlayerEpgScheduleRow = {
  id: string | number;
  startMs: number;
  endMs: number;
  title: string;
  description?: string;
};

export function buildSortedEpgRows(
  listings: PlayerEpgListing[]
): PlayerEpgScheduleRow[] {
  const out: PlayerEpgScheduleRow[] = [];
  for (const p of listings) {
    const range = epgProgramRangeUnixSec(p);
    if (!range) continue;
    out.push({
      id: p.id,
      startMs: range.start * 1000,
      endMs: range.end * 1000,
      title: typeof p.title === "string" ? p.title : "",
      description: typeof p.description === "string" ? p.description : undefined,
    });
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return out;
}

/** Wall clock for EPG “now” — driven from effects so render stays pure of Date.now(). */
export function useTickingClockMs(
  intervalMs: number | null,
  resyncKey: unknown
) {
  const [clockMs, setClockMs] = useState(0);
  useEffect(() => {
    if (intervalMs == null) return;
    const tick = () => setClockMs(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, resyncKey]);
  return clockMs;
}

/** Virtualized schedule — avoids mounting hundreds of DOM nodes when full multi-day EPG loads. */
export function PlayerScheduleVirtualList({
  drawerOpen,
  rows,
  clockMs,
}: {
  drawerOpen: boolean;
  rows: PlayerEpgScheduleRow[];
  clockMs: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const didScrollToNowRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 102,
    overscan: 12,
    measureElement:
      typeof document !== "undefined"
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  useEffect(() => {
    if (!drawerOpen) {
      didScrollToNowRef.current = false;
      return;
    }
    if (didScrollToNowRef.current || rows.length === 0) return;
    const idx = rows.findIndex(
      (r) => r.startMs <= clockMs && r.endMs > clockMs
    );
    const id = window.requestAnimationFrame(() => {
      if (idx >= 0) {
        virtualizer.scrollToIndex(idx, { align: "center" });
      }
      didScrollToNowRef.current = true;
    });
    return () => window.cancelAnimationFrame(id);
  }, [drawerOpen, rows, clockMs, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index]!;
          const onAir = row.startMs <= clockMs && row.endMs > clockMs;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-3"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <div
                className={cn(
                  "rounded-xl p-3 border",
                  onAir
                    ? "border-(--brand)/50 bg-(--brand)/10"
                    : "border-white/10 bg-white/5"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-white/70 tabular-nums">
                    {new Date(row.startMs).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {new Date(row.endMs).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {onAir && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-(--brand)/40 text-white">
                      On air
                    </span>
                  )}
                </div>
                <div className="text-sm text-white mt-1 font-medium">
                  {decodeEpgText(row.title)}
                </div>
                {row.description ? (
                  <div className="text-xs text-white/60 mt-1 line-clamp-3">
                    {decodeEpgText(row.description)}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
