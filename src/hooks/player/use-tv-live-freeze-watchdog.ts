"use client";

import { useEffect, type RefObject } from "react";
import type Hls from "hls.js";
import { applyTvLiveFreezeAction } from "@/lib/live-hls-playback";
import {
  bufferAheadAtPlayhead,
  initialTvLiveFreezeWatchState,
  sampleTvLiveFreezeWatch,
  shouldSwitchLiveToRemux,
  stuckRecoveryCountsTowardRemux,
  type LiveFreezePolicy,
} from "@/lib/live-tv-freeze-recovery";
import { noteLiveSessionStall } from "@/lib/playback-telemetry";
import { isTvOrSilkUserAgent } from "@/lib/tv-user-agent";

const LIVE_FREEZE_TICK_MS = 1_000;

export type UseTvLiveFreezeWatchdogParams = {
  open: boolean;
  isLive: boolean;
  /**
   * Fire TV Silk episode playback can paint one frame and never move.
   * Watch that the same way as live, without treating it as a channel.
   */
  startupWatch?: boolean;
  /** Changing channel resets the stuck-recovery count. */
  channelId: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  remuxActive: boolean;
  remuxGaveUpRef: RefObject<boolean>;
  /** Same teardown + rebuild as flipping the channel. */
  onReinit: () => void;
  /** After two stuck recoveries, switch this channel onto the copy-remux window. */
  onRemuxBudget: () => void;
};

/**
 * Poll the playhead on every live client. Tizen stops firing `timeupdate`
 * when MSE wedges; desktop Chromium does the same. TV escalates
 * play → recoverMediaError → startLoad → rebuild. Desktop and phones
 * start with startLoad() at the playhead, and only seek or rebuild on a
 * decoder stall (buffer still ahead).
 */
export function useTvLiveFreezeWatchdog(p: UseTvLiveFreezeWatchdogParams) {
  const {
    open,
    isLive,
    startupWatch = false,
    channelId,
    videoRef,
    hlsRef,
    remuxActive,
    remuxGaveUpRef,
    onReinit,
    onRemuxBudget,
  } = p;

  useEffect(() => {
    if (!open || (!isLive && !startupWatch)) return;

    const policy: LiveFreezePolicy = isTvOrSilkUserAgent() ? "tv" : "gentle";
    let state = initialTvLiveFreezeWatchState();
    let stuckRecoveries = 0;
    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const bufferAheadSec = bufferAheadAtPlayhead(
        video.buffered,
        video.currentTime
      );
      const { state: next, action } = sampleTvLiveFreezeWatch(
        state,
        {
          nowMs: performance.now(),
          currentTime: video.currentTime,
          paused: video.paused,
          hasError: Boolean(video.error),
          readyState: video.readyState,
          bufferAheadSec,
          fullscreen: Boolean(document.fullscreenElement),
        },
        policy
      );
      state = next;
      if (action === "none") return;
      let switching = false;
      if (isLive && stuckRecoveryCountsTowardRemux(action)) {
        stuckRecoveries += 1;
        switching = shouldSwitchLiveToRemux({
          stuckRecoveries,
          remuxActive,
          gaveUp: remuxGaveUpRef.current,
        });
      }
      noteLiveSessionStall({
        hlsErrorDetail: "playhead_freeze",
        bufferAheadSec,
        recoveryAction: switching ? "remux" : action,
        playheadStuck: true,
      });
      if (switching) {
        onRemuxBudget();
        return;
      }
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
    }, LIVE_FREEZE_TICK_MS);

    return () => window.clearInterval(id);
  }, [
    open,
    isLive,
    startupWatch,
    channelId,
    videoRef,
    hlsRef,
    remuxActive,
    remuxGaveUpRef,
    onReinit,
    onRemuxBudget,
  ]);
}
