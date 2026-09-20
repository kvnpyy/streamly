"use client";

import { useEffect, type RefObject } from "react";
import type Hls from "hls.js";
import { applyTvLiveFreezeAction } from "@/lib/live-hls-playback";
import {
  bufferAheadAtPlayhead,
  initialTvLiveFreezeWatchState,
  sampleTvLiveFreezeWatch,
} from "@/lib/live-tv-freeze-recovery";
import { playbackBreadcrumb } from "@/lib/playback-telemetry";
import { isTvOrSilkUserAgent } from "@/lib/tv-user-agent";

const TV_LIVE_FREEZE_TICK_MS = 1_000;

export type UseTvLiveFreezeWatchdogParams = {
  open: boolean;
  isLive: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  /** Same teardown + rebuild as flipping the channel. */
  onReinit: () => void;
};

/**
 * TV live often wedges the MSE decoder so `timeupdate` stops. Poll the playhead
 * and escalate play → recoverMediaError → startLoad() → full pipeline rebuild
 * (what users already do by flipping away and back).
 */
export function useTvLiveFreezeWatchdog(p: UseTvLiveFreezeWatchdogParams) {
  const { open, isLive, videoRef, hlsRef, onReinit } = p;

  useEffect(() => {
    if (!open || !isLive) return;
    if (typeof navigator === "undefined" || !isTvOrSilkUserAgent()) return;

    let state = initialTvLiveFreezeWatchState();
    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const { state: next, action } = sampleTvLiveFreezeWatch(state, {
        nowMs: performance.now(),
        currentTime: video.currentTime,
        paused: video.paused,
        hasError: Boolean(video.error),
        readyState: video.readyState,
        bufferAheadSec: bufferAheadAtPlayhead(
          video.buffered,
          video.currentTime
        ),
        fullscreen: Boolean(document.fullscreenElement),
      });
      state = next;
      if (action === "none") return;
      playbackBreadcrumb(
        action === "play"
          ? "tv_live_freeze_play"
          : action === "media"
            ? "tv_live_freeze_media"
            : action === "reinit"
              ? "tv_live_freeze_reinit"
              : "tv_live_freeze_reload"
      );
      if (action === "reinit") {
        onReinit();
        state = {
          ...initialTvLiveFreezeWatchState(),
          reinitCount: next.reinitCount,
          lastRecoveryAtMs: performance.now(),
        };
        return;
      }
      applyTvLiveFreezeAction(action, hlsRef.current, video);
    }, TV_LIVE_FREEZE_TICK_MS);

    return () => window.clearInterval(id);
  }, [open, isLive, videoRef, hlsRef, onReinit]);
}
