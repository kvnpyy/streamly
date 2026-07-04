"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Hls from "hls.js";
import { isAppleMobileWebKitDevice } from "@/lib/browser";
import {
  applyGentleLiveHlsRecovery,
  applySoftLiveHlsRecovery,
} from "@/lib/live-hls-playback";
import { suspendPlayerMediaForBackground } from "@/lib/player-teardown";
import type { PlayerSource } from "@/store/player";
import { voidSafeVideoPlay } from "@/lib/video-play";

/** Pause loading when the tab/TV hides briefly (screen off, app switch). */
const BACKGROUND_SUSPEND_MS = 5_000;

/** After overnight standby, VOD transcode/MSE needs a full pipeline reinit. */
const LONG_BACKGROUND_MS = 60_000;

export type UsePlayerPageLifecycleParams = {
  open: boolean;
  current: PlayerSource | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  hlsLiveEdgeRestartGateRef: RefObject<number>;
  onWakeFullReinit: () => void;
};

/**
 * Suspend media on TV/tab sleep and recover without `video.load()` on wake.
 * Sync `load()` after a stale HLS/MSE session freezes Samsung/Fire TV browsers.
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

  useEffect(() => {
    if (!open || !current) return;

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        suspendPlayerMediaForBackground(videoRef.current, hlsRef.current);
        suspendedRef.current = true;
        return;
      }

      if (document.visibilityState !== "visible" || hiddenAtRef.current <= 0) {
        return;
      }

      const hiddenMs = Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = 0;
      if (hiddenMs < BACKGROUND_SUSPEND_MS || !suspendedRef.current) return;
      suspendedRef.current = false;

      const video = videoRef.current;
      if (!video) return;

      if (isAppleMobileWebKitDevice()) {
        voidSafeVideoPlay(video);
        return;
      }

      if (current.kind === "live") {
        const hls = hlsRef.current;
        if (hls) {
          try {
            if (hiddenMs >= LONG_BACKGROUND_MS) {
              applySoftLiveHlsRecovery(hls, video, hlsLiveEdgeRestartGateRef);
            } else {
              applyGentleLiveHlsRecovery(hls, video);
            }
          } catch {
            onWakeFullReinit();
          }
        } else {
          onWakeFullReinit();
        }
        return;
      }

      if (hiddenMs >= LONG_BACKGROUND_MS) {
        onWakeFullReinit();
      } else {
        voidSafeVideoPlay(video);
      }
    };

    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [
    open,
    current,
    videoRef,
    hlsRef,
    hlsLiveEdgeRestartGateRef,
    onWakeFullReinit,
  ]);
}
