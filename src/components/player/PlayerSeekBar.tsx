"use client";

import { useVodSeekPreview } from "@/hooks/use-vod-seek-preview";
import {
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
}: PlayerSeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerActiveRef = useRef(false);
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
      if (!track || duration <= 0) return null;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return { sec: pct * duration, pct: pct * 100 };
    },
    [duration]
  );

  const applyScrubPercent = useCallback(
    (pct: number) => {
      setScrubProgress(pct);
      onScrubPreview(scrubPercentToAbsoluteSec(pct, duration));
    },
    [duration, onScrubPreview]
  );

  const commitScrubPercent = useCallback(
    (pct: number) => {
      onSeekCommit(scrubPercentToAbsoluteSec(pct, duration));
    },
    [duration, onSeekCommit]
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
      if (scrubbing) {
        const hit = secFromClientX(e.clientX);
        if (hit) setScrubProgress(hit.pct);
      }
    },
    [scrubbing, onTrackPointerMove, secFromClientX]
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

      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-white/15 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-white/25"
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
        onPointerDown={() => {
          pointerActiveRef.current = true;
          setScrubbing(true);
          setScrubProgress(progress);
          onScrubStart?.();
        }}
        onPointerMove={onScrubPointerMove}
        onInput={(e) => {
          const pct = parseFloat(e.currentTarget.value);
          if (!Number.isFinite(pct)) return;
          setScrubbing(true);
          applyScrubPercent(pct);
          if (!pointerActiveRef.current) {
            commitScrubPercent(pct);
          }
        }}
        onPointerUp={(e) => {
          const pct = parseFloat(e.currentTarget.value);
          pointerActiveRef.current = false;
          setScrubbing(false);
          setScrubProgress(null);
          if (Number.isFinite(pct)) commitScrubPercent(pct);
        }}
        onPointerCancel={() => {
          pointerActiveRef.current = false;
          setScrubbing(false);
          setScrubProgress(null);
        }}
        aria-label="Seek"
        className="relative w-full appearance-none bg-transparent h-5 cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:size-3.5
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-white
                  [&::-webkit-slider-thumb]:shadow-lg
                  [&::-webkit-slider-thumb]:opacity-0
                  group-hover/scrub:[&::-webkit-slider-thumb]:opacity-100
                  [&::-webkit-slider-thumb]:transition-opacity"
      />
    </div>
  );
}
