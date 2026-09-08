"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Hls from "hls.js";
import { isAppleMobileWebKitDevice } from "@/lib/browser";
import {
  applyGentleLiveHlsRecovery,
  applySoftLiveHlsRecovery,
} from "@/lib/live-hls-playback";
import { isVideoInPictureInPicture } from "@/lib/picture-in-picture";
import {
  PLAYER_BACKGROUND_SUSPEND_MS,
  planBackgroundRecovery,
  shouldScheduleBackgroundSuspend,
  shouldSoftResumeUnsuspendedPlayback,
  type BackgroundContentKind,
  type BackgroundLifecycleReason,
} from "@/lib/player-page-lifecycle";
import { suspendPlayerMediaForBackground } from "@/lib/player-teardown";
import type { PlayerSource } from "@/store/player";
import { isTvOrSilkUserAgent } from "@/lib/tv-user-agent";
import { voidSafeVideoPlay } from "@/lib/video-play";

export type UsePlayerPageLifecycleParams = {
  open: boolean;
  current: PlayerSource | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  hlsLiveEdgeRestartGateRef: RefObject<number>;
  onWakeFullReinit: () => void;
};

/**
 * Restart fragment loading after a background `stopLoad()`, then resume playback.
 * `video.play()` alone leaves live TV black after suspend.
 */
function resumeAfterSuspend(
  video: HTMLVideoElement,
  hls: InstanceType<typeof Hls> | null
): void {
  if (hls) {
    try {
      hls.startLoad();
    } catch {
      /* noop */
    }
  }
  voidSafeVideoPlay(video);
}

/**
 * Suspend media on TV sleep / page freeze; keep playing on desktop tab hide.
 * Recovers on wake without sync `video.load()`.
 *
 * Listens to visibilitychange, pagehide/pageshow (bfcache), and freeze/resume.
 *
 * Critical: do **not** pause/`stopLoad` on the first hidden tick. TV browsers (Silk,
 * Tizen, webOS) often fire brief visibility flickers when opening the player; an
 * immediate suspend + “ignore short background” recovery left live streams paused
 * forever (black screen, all channels).
 */
export function usePlayerPageLifecycle(p: UsePlayerPageLifecycleParams) {
  const {
    open,
    current,
    videoRef,
    hlsRef,
    hlsLiveEdgeRestartGateRef,
    onWakeFullReinit,
  } = p;

  const hiddenAtRef = useRef(0);
  const suspendedRef = useRef(false);
  const playingWhenHiddenRef = useRef(false);
  const suspendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || !current) return;

    const contentKind: BackgroundContentKind =
      current.kind === "live" ? "live" : current.kind === "series" ? "series" : "vod";

    const clearSuspendTimer = () => {
      if (suspendTimerRef.current != null) {
        clearTimeout(suspendTimerRef.current);
        suspendTimerRef.current = null;
      }
    };

    const markBackground = (reason: BackgroundLifecycleReason) => {
      const video = videoRef.current;
      if (!hiddenAtRef.current) {
        hiddenAtRef.current = Date.now();
        playingWhenHiddenRef.current = !!video && !video.paused && !video.ended;
      }

      if (
        !shouldScheduleBackgroundSuspend({
          reason,
          isTvOrSilk: isTvOrSilkUserAgent(),
          isPictureInPicture: isVideoInPictureInPicture(video),
        })
      ) {
        return;
      }

      if (suspendedRef.current || suspendTimerRef.current != null) return;
      suspendTimerRef.current = setTimeout(() => {
        suspendTimerRef.current = null;
        // Woke before the delay elapsed (recover cleared hiddenAt).
        if (!hiddenAtRef.current || suspendedRef.current) return;
        // Entered PiP during the TV flicker delay — user wants playback to continue.
        if (isVideoInPictureInPicture(videoRef.current)) return;
        suspendPlayerMediaForBackground(videoRef.current, hlsRef.current);
        suspendedRef.current = true;
      }, PLAYER_BACKGROUND_SUSPEND_MS);
    };

    const applyRecoveryPlan = (hiddenMs: number) => {
      const video = videoRef.current;
      if (!video) return;

      const plan = planBackgroundRecovery({
        hiddenMs,
        isAppleMobileWebKit: isAppleMobileWebKitDevice(),
        hasHls: !!hlsRef.current,
        contentKind,
      });

      switch (plan.action) {
        case "none":
          // Safety net: we only reach here after a real suspend; always resume.
          resumeAfterSuspend(video, hlsRef.current);
          return;
        case "play":
          resumeAfterSuspend(video, hlsRef.current);
          return;
        case "full-reinit":
          onWakeFullReinit();
          return;
        case "gentle-hls": {
          const hls = hlsRef.current;
          if (!hls) {
            onWakeFullReinit();
            return;
          }
          try {
            applyGentleLiveHlsRecovery(hls, video);
          } catch {
            onWakeFullReinit();
          }
          return;
        }
        case "soft-hls": {
          const hls = hlsRef.current;
          if (!hls) {
            onWakeFullReinit();
            return;
          }
          try {
            applySoftLiveHlsRecovery(hls, video, hlsLiveEdgeRestartGateRef);
          } catch {
            onWakeFullReinit();
          }
          return;
        }
      }
    };

    const recoverFromBackground = () => {
      clearSuspendTimer();
      if (!hiddenAtRef.current) return;

      // Never reached stopLoad/pause — leave a still-playing desktop tab alone.
      // Soft-resume when the OS paused us (iOS, Memory Saver) without our suspend.
      if (!suspendedRef.current) {
        const video = videoRef.current;
        const softResume = shouldSoftResumeUnsuspendedPlayback({
          wasPlayingWhenHidden: playingWhenHiddenRef.current,
          isVideoPaused: !!video?.paused,
          didSuspend: false,
        });
        hiddenAtRef.current = 0;
        playingWhenHiddenRef.current = false;
        if (softResume && video) voidSafeVideoPlay(video);
        return;
      }

      const hiddenMs = Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = 0;
      suspendedRef.current = false;
      playingWhenHiddenRef.current = false;
      applyRecoveryPlan(hiddenMs);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markBackground("visibility");
        return;
      }
      if (document.visibilityState === "visible") {
        recoverFromBackground();
      }
    };

    const onPageHide = () => {
      markBackground("pagehide");
    };

    const onPageShow = () => {
      // TV WebViews often fire pageshow without bfcache (`persisted=false`) on wake.
      recoverFromBackground();
    };

    const onFreeze = () => {
      markBackground("freeze");
    };

    const onResume = () => {
      recoverFromBackground();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);

    return () => {
      clearSuspendTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);
    };
  }, [
    open,
    current,
    videoRef,
    hlsRef,
    hlsLiveEdgeRestartGateRef,
    onWakeFullReinit,
  ]);
}
