"use client";

import { useEffect, type RefObject } from "react";
import type Hls from "hls.js";
import { recoverTvLiveMedia } from "@/lib/live-hls-playback";
import {
  bufferAheadAtPlayhead,
  nextTvLiveFreezeAction,
  playheadLooksStuck,
  stepAfterTvLiveFreezeAction,
  type TvLiveFreezeStep,
} from "@/lib/live-tv-freeze-recovery";
import { playbackBreadcrumb } from "@/lib/playback-telemetry";
import { isAmazonSilkUserAgent, isTvClassUserAgent } from "@/lib/tv-user-agent";
import { voidSafeVideoPlay } from "@/lib/video-play";
import type { PlayerSource } from "@/store/player";

export type UsePlayerTvLiveWatchdogParams = {
  open: boolean;
  current: PlayerSource | null;
  /** Bumps when the pipeline is rebuilt — remount timers. */
  playbackRetryKey: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
};

function isTvOrSilkLiveClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return isTvClassUserAgent(ua) || isAmazonSilkUserAgent(ua);
}

/**
 * Poll live playback on Tizen / webOS / Silk. Frozen events stop `timeupdate`.
 * Never `startLoad(-1)` or rebuild — those snap the live edge (repeat / jump).
 */
export function usePlayerTvLiveWatchdog(p: UsePlayerTvLiveWatchdogParams) {
  const { open, current, playbackRetryKey, videoRef, hlsRef } = p;

  useEffect(() => {
    if (!open || current?.kind !== "live") return;
    if (!isTvOrSilkLiveClient()) return;
    const video = videoRef.current;
    if (!video) return;

    const state = {
      lastCt: -1,
      stuckSince: 0,
      waitingSince: 0,
      lastRecoveryAt: 0,
      recoveryStep: 0 as TvLiveFreezeStep,
      sawProgress: false,
    };

    const onWaiting = () => {
      if (!state.waitingSince) state.waitingSince = performance.now();
    };
    const onPlaying = () => {
      state.waitingSince = 0;
    };

    const apply = (action: "play" | "media" | "reload") => {
      const v = videoRef.current;
      if (!v) return;
      const now = performance.now();
      state.lastRecoveryAt = now;
      state.stuckSince = now;
      state.waitingSince = 0;
      state.recoveryStep = stepAfterTvLiveFreezeAction(action);
      playbackBreadcrumb(
        action === "play"
          ? "tv_live_freeze_play"
          : action === "media"
            ? "tv_live_freeze_media"
            : "tv_live_freeze_reload",
        { channelId: current.id }
      );
      const hls = hlsRef.current;
      if (action === "play") {
        voidSafeVideoPlay(v);
        return;
      }
      if (!hls) {
        voidSafeVideoPlay(v);
        return;
      }
      try {
        if (action === "reload") {
          hls.startLoad();
          voidSafeVideoPlay(v);
        } else {
          recoverTvLiveMedia(hls, v);
        }
      } catch {
        voidSafeVideoPlay(v);
      }
    };

    const tick = () => {
      const v = videoRef.current;
      if (!v) return;
      const now = performance.now();
      if (v.paused || v.error) {
        state.lastCt = v.currentTime;
        state.stuckSince = now;
        state.waitingSince = 0;
        return;
      }

      const ct = v.currentTime;
      if (state.lastCt < 0) {
        state.lastCt = ct;
        state.stuckSince = now;
        return;
      }

      if (!playheadLooksStuck(ct, state.lastCt)) {
        state.lastCt = ct;
        state.stuckSince = now;
        state.waitingSince = 0;
        state.recoveryStep = 0;
        state.sawProgress = true;
        return;
      }

      const action = nextTvLiveFreezeAction({
        nowMs: now,
        currentTime: ct,
        lastCurrentTime: state.lastCt,
        paused: v.paused,
        hasError: !!v.error,
        sawProgress: state.sawProgress,
        stuckMs: now - state.stuckSince,
        waitingMs: state.waitingSince ? now - state.waitingSince : 0,
        bufferAheadSec: bufferAheadAtPlayhead(v.buffered, ct),
        readyState: v.readyState,
        recoveryStep: state.recoveryStep,
        lastRecoveryAtMs: state.lastRecoveryAt,
      });
      if (action === "none") return;
      apply(action);
    };

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
    };
  }, [open, current?.kind, current?.url, current?.id, playbackRetryKey, videoRef, hlsRef]);
}
