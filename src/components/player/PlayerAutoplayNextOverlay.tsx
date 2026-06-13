"use client";

import type { PlayerSource } from "@/store/player";
import { AnimatePresence, motion } from "framer-motion";
import { Play, X } from "lucide-react";

export type PlayerAutoplayNextOverlayProps = {
  visible: boolean;
  nextEpisode: PlayerSource | null;
  countdownSec: number | null;
  onPlayNextNow: () => void;
  onCancel: () => void;
  onWatchCredits?: () => void;
  showWatchCredits?: boolean;
};

/** Netflix-style “next episode” countdown shown near the end of a series episode. */
export function PlayerAutoplayNextOverlay({
  visible,
  nextEpisode,
  countdownSec,
  onPlayNextNow,
  onCancel,
  onWatchCredits,
  showWatchCredits = false,
}: PlayerAutoplayNextOverlayProps) {
  return (
    <AnimatePresence>
      {visible && nextEpisode && countdownSec != null && (
        <motion.div
          key="autoplay-next"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute bottom-28 sm:bottom-32 right-3 sm:right-6 z-[12] w-[min(100%,20rem)]"
          role="dialog"
          aria-label="Next episode"
          aria-live="polite"
        >
          <div className="rounded-2xl border border-white/15 bg-black/85 shadow-2xl overflow-hidden backdrop-blur-md">
            <div className="flex gap-3 p-3">
              {nextEpisode.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={nextEpisode.poster}
                  alt=""
                  className="size-16 sm:size-[4.5rem] rounded-lg object-cover shrink-0 bg-white/10"
                />
              ) : (
                <div className="size-16 sm:size-[4.5rem] rounded-lg bg-white/10 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-white/50">
                  Up next
                </div>
                <div className="text-white text-sm font-semibold truncate">
                  {nextEpisode.title}
                </div>
                {nextEpisode.subtitle && (
                  <div className="text-white/70 text-xs truncate mt-0.5">
                    {nextEpisode.subtitle}
                  </div>
                )}
                <div className="text-white/55 text-xs mt-1.5 tabular-nums">
                  Playing in {countdownSec}s…
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                aria-label="Cancel autoplay"
                className="size-8 shrink-0 grid place-items-center rounded-lg hover:bg-white/10 text-white/80"
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
                  className="flex-1 px-3 py-2.5 text-xs sm:text-sm text-white/85 hover:bg-white/10 transition-colors"
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
                className="flex-1 px-3 py-2.5 text-xs sm:text-sm font-medium text-white bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center gap-1.5"
              >
                <Play className="size-3.5 fill-white" />
                Play now
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
