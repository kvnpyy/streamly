"use client";

import { useEffect, type RefObject } from "react";
import type { PlayerSource } from "@/store/player";

function videoHasMeaningfulBuffer(video: HTMLVideoElement): boolean {
  let end = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    end = Math.max(end, video.buffered.end(i));
  }
  return end > 0.35;
}

export type UsePlayerStallEscalationParams = {
  open: boolean;
  stalled: boolean;
  isLive: boolean;
  current: PlayerSource | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  onAutoRecover: () => void;
  setStalled: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  setError: (message: string | null) => void;
  /** Extra hint (e.g. wallet extensions on Chromium). */
  extensionHint?: string | null;
};

/**
 * When the stall watchdog fires on live TV, nudge playback once, then surface a
 * real error instead of leaving "Still loading…" up indefinitely (common when
 * extensions interfere with MSE/hls.js).
 */
export function usePlayerStallEscalation(p: UsePlayerStallEscalationParams) {
  const {
    open,
    stalled,
    isLive,
    current,
    videoRef,
    onAutoRecover,
    setStalled,
    setLoading,
    setError,
    extensionHint,
  } = p;

  useEffect(() => {
    if (!open || !stalled || !isLive || !current) return;

    const autoRecoverMs = 6_000;
    const escalateMs = 28_000;

    const autoId = window.setTimeout(() => {
      const v = videoRef.current;
      if (
        v &&
        (videoHasMeaningfulBuffer(v) ||
          !v.paused ||
          v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
      ) {
        return;
      }
      onAutoRecover();
    }, autoRecoverMs);

    const escalateId = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && (videoHasMeaningfulBuffer(v) || v.readyState >= 3)) {
        setStalled(false);
        setLoading(false);
        return;
      }
      setStalled(false);
      setLoading(false);
      const ext = extensionHint ? ` ${extensionHint}` : "";
      setError(
        `This channel didn't start after several retries. It may be offline at your provider, or playback may be blocked by a browser extension.${ext} Tap Try again, use Incognito with extensions off, or copy the stream URL for VLC.`
      );
    }, escalateMs);

    return () => {
      window.clearTimeout(autoId);
      window.clearTimeout(escalateId);
    };
  }, [
    open,
    stalled,
    isLive,
    current?.url,
    videoRef,
    onAutoRecover,
    setStalled,
    setLoading,
    setError,
    extensionHint,
  ]);
}
