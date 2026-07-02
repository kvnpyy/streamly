"use client";

import {
  autoplayDisplayCountdownSec,
  episodeAutoplayKey,
  getSeriesNextEpisode,
  shouldAutoplayOnEnded,
  shouldOfferAutoplayNext,
} from "@/lib/player-autoplay-next";
import type { PlayerPlaylist, PlayerSource } from "@/store/player";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

export type UsePlayerAutoplayNextParams = {
  open: boolean;
  current: PlayerSource | null;
  playlist: PlayerPlaylist | null;
  index: number;
  timeSec: number;
  durationSec: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  onPlayNext: () => void;
};

export type UsePlayerAutoplayNextResult = {
  visible: boolean;
  nextEpisode: PlayerSource | null;
  countdownSec: number | null;
  cancelAutoplay: () => void;
  playNextNow: () => void;
  watchCredits: () => void;
};

export function usePlayerAutoplayNext(
  p: UsePlayerAutoplayNextParams
): UsePlayerAutoplayNextResult {
  const {
    open,
    current,
    playlist,
    index,
    timeSec,
    durationSec,
    videoRef,
    onPlayNext,
  } = p;

  const nextEpisode = useMemo(
    () => getSeriesNextEpisode(playlist, index),
    [playlist, index]
  );
  const episodeKey = current ? episodeAutoplayKey(current) : null;
  const hasNextEpisode = nextEpisode != null;

  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [watchCreditsKey, setWatchCreditsKey] = useState<string | null>(null);
  const advancedRef = useRef(false);
  const onPlayNextRef = useRef(onPlayNext);

  useEffect(() => {
    onPlayNextRef.current = onPlayNext;
  }, [onPlayNext]);

  useEffect(() => {
    advancedRef.current = false;
  }, [episodeKey]);

  const dismissedForEpisode =
    episodeKey != null && dismissedKey === episodeKey;
  const watchCreditsForEpisode =
    episodeKey != null && watchCreditsKey === episodeKey;

  const shouldOffer = shouldOfferAutoplayNext({
    open,
    kind: current?.kind,
    playlist,
    index,
    durationSec,
    currentTimeSec: timeSec,
    dismissedForEpisode,
    watchCreditsForEpisode,
    hasNextEpisode,
  });

  const positionCountdownSec = useMemo(
    () =>
      autoplayDisplayCountdownSec({
        durationSec,
        currentTimeSec: timeSec,
        shouldOffer,
      }),
    [durationSec, timeSec, shouldOffer]
  );

  const advanceToNext = useCallback(() => {
    if (advancedRef.current || !hasNextEpisode) return;
    advancedRef.current = true;
    onPlayNextRef.current();
  }, [hasNextEpisode]);

  useEffect(() => {
    if (positionCountdownSec !== 0) return;
    const v = videoRef.current;
    if (v?.paused) return;
    advanceToNext();
  }, [positionCountdownSec, advanceToNext, videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !open) return;

    const onEnded = () => {
      if (v.paused && !v.ended) return;
      if (
        !shouldAutoplayOnEnded({
          kind: current?.kind,
          playlist,
          index,
          dismissedForEpisode,
          watchCreditsForEpisode,
          hasNextEpisode,
        })
      ) {
        return;
      }
      advanceToNext();
    };

    v.addEventListener("ended", onEnded);
    return () => v.removeEventListener("ended", onEnded);
  }, [
    videoRef,
    open,
    current?.kind,
    playlist,
    index,
    dismissedForEpisode,
    watchCreditsForEpisode,
    hasNextEpisode,
    advanceToNext,
  ]);

  const cancelAutoplay = useCallback(() => {
    if (episodeKey) setDismissedKey(episodeKey);
  }, [episodeKey]);

  const watchCredits = useCallback(() => {
    if (episodeKey) setWatchCreditsKey(episodeKey);
  }, [episodeKey]);

  const playNextNow = useCallback(() => {
    advanceToNext();
  }, [advanceToNext]);

  const visibleCountdown =
    positionCountdownSec != null && positionCountdownSec > 0
      ? positionCountdownSec
      : null;

  return {
    visible:
      hasNextEpisode &&
      !dismissedForEpisode &&
      !watchCreditsForEpisode &&
      shouldOffer &&
      visibleCountdown != null,
    nextEpisode,
    countdownSec: visibleCountdown,
    cancelAutoplay,
    playNextNow,
    watchCredits,
  };
}
