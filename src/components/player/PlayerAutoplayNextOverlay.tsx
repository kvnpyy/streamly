"use client";

import type { PlayerSource } from "@/store/player";
import { AnimatePresence, motion } from "framer-motion";
import { Play, X } from "lucide-react";

export type PlayerAutoplayNextOverlayProps = {
  visible: boolean;
  nextEpisode: PlayerSource | null;
  countdownSec: number | null;
  countdownTotalSec: number;
  onPlayNextNow: () => void;
  onCancel: () => void;
  onWatchCredits?: () => void;
  showWatchCredits?: boolean;
};

/** Credits card — stays up for the ending, then plays the next episode. */
export function PlayerAutoplayNextOverlay({
  visible,
  nextEpisode,
  countdownSec,
  countdownTotalSec,
  onPlayNextNow,
  onCancel,
  onWatchCredits,
  showWatchCredits = false,
}: PlayerAutoplayNextOverlayProps) {
  const total = Math.max(1, countdownTotalSec);
  const remaining = countdownSec != null ? Math.max(0, countdownSec) : null;
  const progress =
    remaining == null ? 1 : Math.max(0, Math.min(1, remaining / total));

  return (
    <AnimatePresence>
      {visible && nextEpisode && (
        <motion.div
          key="autoplay-next"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute bottom-36 sm:bottom-40 right-3 sm:right-6 z-[14] w-[min(100%,22rem)] pointer-events-auto"
          role="dialog"
          aria-label="Next episode"
          aria-live="polite"
          data-player-controls=""
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rounded-2xl border border-white/15 bg-black/80 shadow-[0_16px_50px_rgba(0,0,0,0.55)] overflow-hidden backdrop-blur-md">
            {remaining != null && (
              <div className="h-1 bg-white/10">
                <div
                  className="h-full bg-white origin-left transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}
            <div className="flex gap-3 p-3">
              {nextEpisode.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={nextEpisode.poster}
                  alt=""
                  className="size-[4.5rem] sm:size-20 rounded-lg object-cover shrink-0 bg-white/10"
                />
              ) : (
                <div className="size-[4.5rem] sm:size-20 rounded-lg bg-white/10 shrink-0 grid place-items-center">
                  <Play className="size-6 fill-white/80 text-white/80" />
                </div>
              )}
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/50">
                  Next episode
                </div>
                <div className="text-white text-sm sm:text-[15px] font-semibold truncate mt-0.5">
                  {nextEpisode.title}
                </div>
                {nextEpisode.subtitle && (
                  <div className="text-white/70 text-xs truncate mt-0.5">
                    {nextEpisode.subtitle}
                  </div>
                )}
                {remaining != null && (
                  <div className="text-white/60 text-xs mt-1.5 tabular-nums">
                    {remaining > 0 ? `Playing in ${remaining}s` : "Playing next…"}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                aria-label="Dismiss next episode"
                className="size-8 shrink-0 grid place-items-center rounded-lg hover:bg-white/10 text-white/75"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex border-t border-white/10">
              {showWatchCredits && onWatchCredits && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onWatchCredits();
                  }}
                  className="flex-1 px-3 py-3 text-xs sm:text-sm text-white/80 hover:bg-white/10 transition-colors"
                >
                  Watch credits
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayNextNow();
                }}
                className="flex-1 px-3 py-3 text-xs sm:text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors flex items-center justify-center gap-1.5"
              >
                <Play className="size-3.5 fill-black" />
                Play next
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
