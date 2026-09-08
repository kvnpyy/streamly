"use client";

import { useVodSeekPreview } from "@/hooks/use-vod-seek-preview";
import {
  canCommitVodScrub,
  clientXToScrubPercent,
  displayScrubProgressPercent,
  scrubPercentToAbsoluteSec,
} from "@/lib/vod-seek-scrub";
import { formatTime } from "@/lib/utils";
import { useCallback, useRef, useState } from "react";

type PlayerSeekBarProps = {
  duration: number;
  time: number;
  progress: number;
  bufferedProgress: number;
  playbackUrl: string;
  poster?: string;
  onScrubStart?: () => void;
  onScrubPreview: (targetSec: number) => void;
  onSeekCommit: (targetSec: number) => void;
  /** Pointer cancelled mid-scrub — clear parent gate and restore clock. */
  onScrubCancel?: () => void;
};

export function PlayerSeekBar({
  duration,
  time,
  progress,
  bufferedProgress,
  playbackUrl,
  poster,
  onScrubStart,
  onScrubPreview,
  onSeekCommit,
  onScrubCancel,
}: PlayerSeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerActiveRef = useRef(false);
  /** Set on pointerup commit — ignore a trailing pointercancel that would abort land. */
  const scrubCommittedRef = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);
  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [hoverPct, setHoverPct] = useState(0);

  const sliderProgress = displayScrubProgressPercent(
    scrubbing,
    scrubProgress,
    progress
  );

  const previewSec = scrubbing
    ? scrubPercentToAbsoluteSec(sliderProgress, duration)
    : hoverSec;
  const previewActive = previewSec != null && duration > 0;
  const previewPct = scrubbing ? sliderProgress : hoverPct;

  const { imageUrl, loading } = useVodSeekPreview({
    playbackUrl,
    previewSec: previewActive ? previewSec : null,
    enabled: previewActive,
    poster,
  });

  const secFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || !canCommitVodScrub(duration)) return null;
      const rect = track.getBoundingClientRect();
      const pct = clientXToScrubPercent(clientX, rect.left, rect.width);
      if (pct == null) return null;
      return { sec: scrubPercentToAbsoluteSec(pct, duration), pct };
    },
    [duration]
  );

  const applyScrubPercent = useCallback(
    (pct: number) => {
      if (!canCommitVodScrub(duration)) return;
      setScrubProgress(pct);
      onScrubPreview(scrubPercentToAbsoluteSec(pct, duration));
    },
    [duration, onScrubPreview]
  );

  const commitScrubPercent = useCallback(
    (pct: number) => {
      if (!canCommitVodScrub(duration)) return;
      onSeekCommit(scrubPercentToAbsoluteSec(pct, duration));
    },
    [duration, onSeekCommit]
  );

  const applyPointerClientX = useCallback(
    (clientX: number) => {
      const hit = secFromClientX(clientX);
      if (!hit) return null;
      setScrubProgress(hit.pct);
      onScrubPreview(hit.sec);
      return hit;
    },
    [onScrubPreview, secFromClientX]
  );

  const onTrackPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (scrubbing) return;
      const hit = secFromClientX(e.clientX);
      if (!hit) return;
      setHoverSec(hit.sec);
      setHoverPct(hit.pct);
    },
    [scrubbing, secFromClientX]
  );

  const onScrubPointerMove = useCallback(
    (e: React.PointerEvent) => {
      onTrackPointerMove(e);
      if (scrubbing) applyPointerClientX(e.clientX);
    },
    [scrubbing, onTrackPointerMove, applyPointerClientX]
  );

  const onTrackPointerLeave = useCallback(() => {
    if (!scrubbing) {
      setHoverSec(null);
    }
  }, [scrubbing]);

  return (
    <div
      ref={trackRef}
      className="relative group/scrub mb-3"
      onPointerMove={onTrackPointerMove}
      onPointerLeave={onTrackPointerLeave}
    >
      {previewActive && (
        <div
          className="pointer-events-none absolute bottom-full mb-2 z-20 -translate-x-1/2"
          style={{ left: `${previewPct}%` }}
        >
          <div className="rounded-lg overflow-hidden border border-white/20 bg-black/90 shadow-xl w-[160px]">
            <div className="aspect-video bg-black/60 relative">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-[10px] text-white/50">
                  {loading ? "Loading…" : "Preview"}
                </div>
              )}
            </div>
            <p className="px-2 py-1 text-center text-[11px] tabular-nums text-white/90">
              {formatTime(previewSec ?? 0)}
            </p>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-white/30 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-white/40"
          style={{ width: `${bufferedProgress}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-(--brand-2)"
          style={{ width: `${sliderProgress}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={sliderProgress}
        onPointerDown={(e) => {
          if (!canCommitVodScrub(duration)) return;
          pointerActiveRef.current = true;
          scrubCommittedRef.current = false;
          setScrubbing(true);
          onScrubStart?.();
          // Click position wins — a controlled range often still reports the
          // old playhead (0) on pointerup, which rebuilt the title from 00:00.
          applyPointerClientX(e.clientX);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* not capturable */
          }
        }}
        onPointerMove={onScrubPointerMove}
        onInput={(e) => {
          // Pointer path owns the value; range onInput is keyboard / a11y only.
          if (pointerActiveRef.current) return;
          const pct = parseFloat(e.currentTarget.value);
          if (!Number.isFinite(pct) || !canCommitVodScrub(duration)) return;
          setScrubbing(true);
          applyScrubPercent(pct);
          scrubCommittedRef.current = true;
          commitScrubPercent(pct);
        }}
        onPointerUp={(e) => {
          pointerActiveRef.current = false;
          setScrubbing(false);
          const hit = applyPointerClientX(e.clientX);
          setScrubProgress(null);
          if (hit) {
            // Mark committed before commit so a same-turn pointercancel cannot
            // bump landGen and snap the playhead back to the tip.
            scrubCommittedRef.current = true;
            onSeekCommit(hit.sec);
          }
        }}
        onPointerCancel={() => {
          pointerActiveRef.current = false;
          setScrubbing(false);
          setScrubProgress(null);
          if (scrubCommittedRef.current) return;
          onScrubCancel?.();
        }}
        aria-label="Seek"
        disabled={!canCommitVodScrub(duration)}
        className="relative w-full appearance-none bg-transparent h-6 cursor-pointer touch-none
                  [&::-webkit-slider-runnable-track]:appearance-none
                  [&::-webkit-slider-runnable-track]:bg-transparent
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:size-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:shadow-lg
                  [&::-moz-range-track]:bg-transparent
                  [&::-moz-range-track]:border-0
                  [&::-moz-range-thumb]:appearance-none
                  [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:size-4
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-white"
      />
    </div>
  );
}
