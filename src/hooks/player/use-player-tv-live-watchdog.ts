"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Hls from "hls.js";
import {
  applyGentleLiveHlsRecovery,
  applySoftLiveHlsRecovery,
} from "@/lib/live-hls-playback";
import {
  bufferAheadSec,
  nextTvLiveFreezeAction,
  playheadLooksStuck,
  stepAfterTvLiveFreezeAction,
  type TvLiveFreezeStep,
} from "@/lib/live-tv-freeze-recovery";
import { playbackBreadcrumb } from "@/lib/playback-telemetry";
import { isAmazonSilkUserAgent, isTvClassUserAgent } from "@/lib/tv-user-agent";
import type { PlayerSource } from "@/store/player";

export type UsePlayerTvLiveWatchdogParams = {
  open: boolean;
  current: PlayerSource | null;
  /** Bumps when the pipeline is rebuilt — remount timers, keep reinit cap. */
  playbackRetryKey: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  hlsLiveEdgeRestartGateRef: RefObject<number>;
  onFullReinit: () => void;
};

function isTvOrSilkLiveClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return isTvClassUserAgent(ua) || isAmazonSilkUserAgent(ua);
}

/**
 * Poll live playback on Tizen / webOS / Silk. Frozen events stop `timeupdate`,
 * so the desktop stuck-playhead path never runs — this interval is the recovery.
 */
export function usePlayerTvLiveWatchdog(p: UsePlayerTvLiveWatchdogParams) {
  const {
    open,
    current,
    playbackRetryKey,
    videoRef,
    hlsRef,
    hlsLiveEdgeRestartGateRef,
    onFullReinit,
  } = p;

  const reinitByUrlRef = useRef({ url: "", n: 0 });
  const onFullReinitRef = useRef(onFullReinit);

  useEffect(() => {
    onFullReinitRef.current = onFullReinit;
  }, [onFullReinit]);

  useEffect(() => {
    if (!open || current?.kind !== "live") return;
    if (!isTvOrSilkLiveClient()) return;
    const video = videoRef.current;
    if (!video) return;

    const url = current.url;
    if (reinitByUrlRef.current.url !== url) {
      reinitByUrlRef.current = { url, n: 0 };
    }

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

    const apply = (action: "gentle" | "soft" | "reinit") => {
      const v = videoRef.current;
      if (!v) return;
      const now = performance.now();
      state.lastRecoveryAt = now;
      state.stuckSince = now;
      state.waitingSince = 0;
      state.recoveryStep = stepAfterTvLiveFreezeAction(action);
      playbackBreadcrumb(
        action === "gentle"
          ? "tv_live_freeze_gentle"
          : action === "soft"
            ? "tv_live_freeze_soft"
            : "tv_live_freeze_reinit",
        { channelId: current.id, reinitCount: reinitByUrlRef.current.n }
      );
      if (action === "reinit") {
        reinitByUrlRef.current.n += 1;
        onFullReinitRef.current();
        return;
      }
      const hls = hlsRef.current;
      if (!hls) {
        if (action === "soft") onFullReinitRef.current();
        return;
      }
      try {
        if (action === "soft") {
          applySoftLiveHlsRecovery(hls, v, hlsLiveEdgeRestartGateRef);
        } else {
          applyGentleLiveHlsRecovery(hls, v);
        }
      } catch {
        if (action === "soft") onFullReinitRef.current();
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
        bufferAheadSec: bufferAheadSec(v.buffered, ct),
        readyState: v.readyState,
        recoveryStep: state.recoveryStep,
        lastRecoveryAtMs: state.lastRecoveryAt,
        reinitCount: reinitByUrlRef.current.n,
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
  }, [
    open,
    current?.kind,
    current?.url,
    current?.id,
    playbackRetryKey,
    videoRef,
    hlsRef,
    hlsLiveEdgeRestartGateRef,
  ]);
}
