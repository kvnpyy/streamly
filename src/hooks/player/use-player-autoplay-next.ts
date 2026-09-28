"use client";

import {
  AUTOPLAY_COUNTDOWN_SEC,
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
  /** Full title length. Used so a guessed credit window does not auto-skip early. */
  durationSec: number;
  /** Absolute credits start. Null until the title duration is known. */
  creditsStartSec: number | null;
  creditsExact: boolean;
  seeking: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onPlayNext: () => void;
};

export type UsePlayerAutoplayNextResult = {
  visible: boolean;
  nextEpisode: PlayerSource | null;
  countdownSec: number | null;
  countdownTotalSec: number;
  /** Viewer chose cancel or watch credits — drop a next-episode warm. */
  dismissed: boolean;
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
    creditsStartSec,
    creditsExact,
    seeking,
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
  const [stickyKey, setStickyKey] = useState<string | null>(null);
  const [endedLatch, setEndedLatch] = useState(false);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const [trackedEpisode, setTrackedEpisode] = useState(episodeKey);
  const advancedRef = useRef(false);
  const onPlayNextRef = useRef(onPlayNext);
  const endedLatchRef = useRef(false);

  useEffect(() => {
    onPlayNextRef.current = onPlayNext;
    endedLatchRef.current = endedLatch;
  }, [onPlayNext, endedLatch]);

  useEffect(() => {
    advancedRef.current = false;
  }, [episodeKey]);

  if (episodeKey !== trackedEpisode) {
    setTrackedEpisode(episodeKey);
    setEndedLatch(false);
    setStickyKey(null);
    setCountdownSec(null);
  }

  const dismissedForEpisode =
    episodeKey != null && dismissedKey === episodeKey;
  const watchCreditsForEpisode =
    episodeKey != null && watchCreditsKey === episodeKey;

  const offer = shouldOfferAutoplayNext({
    open,
    kind: current?.kind,
    playlist,
    index,
    currentTimeSec: timeSec,
    creditsStartSec,
    endedLatch: episodeKey === trackedEpisode ? endedLatch : false,
    seeking,
    dismissedForEpisode,
    watchCreditsForEpisode,
    hasNextEpisode,
  });

  if (offer && episodeKey && stickyKey !== episodeKey) {
    setStickyKey(episodeKey);
  }
  if (
    stickyKey === episodeKey &&
    episodeKey != null &&
    creditsStartSec != null &&
    !endedLatch &&
    timeSec < creditsStartSec - 20
  ) {
    setStickyKey(null);
    setCountdownSec(null);
  }

  const sticky = episodeKey != null && stickyKey === episodeKey;
  const visible =
    open &&
    hasNextEpisode &&
    !seeking &&
    !dismissedForEpisode &&
    !watchCreditsForEpisode &&
    (offer || sticky || (endedLatch && episodeKey === trackedEpisode));

  const remainingSec =
    Number.isFinite(durationSec) && durationSec > 0
      ? Math.max(0, durationSec - timeSec)
      : Number.POSITIVE_INFINITY;
  const countdownArmed =
    visible &&
    (endedLatch ||
      creditsExact ||
      remainingSec <= AUTOPLAY_COUNTDOWN_SEC + 0.4);

  if (countdownArmed && countdownSec == null) {
    setCountdownSec(AUTOPLAY_COUNTDOWN_SEC);
  }

  const advanceToNext = useCallback(() => {
    if (advancedRef.current || !hasNextEpisode) return;
    advancedRef.current = true;
    onPlayNextRef.current();
  }, [hasNextEpisode]);

  useEffect(() => {
    if (!visible || !countdownArmed) return;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      const ended = endedLatchRef.current || !!v?.ended;
      if (v?.paused && !ended) return;
      setCountdownSec((c) => {
        if (c == null) return AUTOPLAY_COUNTDOWN_SEC;
        return c <= 1 ? 0 : c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [visible, countdownArmed, videoRef]);

  useEffect(() => {
    if (countdownSec !== 0 || !countdownArmed) return;
    const v = videoRef.current;
    const ended = endedLatchRef.current || !!v?.ended;
    if (v?.paused && !ended) return;
    advanceToNext();
  }, [countdownSec, countdownArmed, advanceToNext, videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !open) return;

    const onEnded = () => {
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
      // Transcode playback pauses, then dispatches `ended` itself — `video.ended`
      // stays false. Still show the card instead of skipping straight through.
      setEndedLatch(true);
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
  ]);

  const cancelAutoplay = useCallback(() => {
    setCountdownSec(null);
    if (episodeKey) setDismissedKey(episodeKey);
  }, [episodeKey]);

  const watchCredits = useCallback(() => {
    setCountdownSec(null);
    setEndedLatch(false);
    if (episodeKey) setWatchCreditsKey(episodeKey);
  }, [episodeKey]);

  const playNextNow = useCallback(() => {
    advanceToNext();
  }, [advanceToNext]);

  return {
    visible,
    nextEpisode,
    countdownSec: visible && countdownArmed ? countdownSec : null,
    countdownTotalSec: AUTOPLAY_COUNTDOWN_SEC,
    dismissed: dismissedForEpisode || watchCreditsForEpisode,
    cancelAutoplay,
    playNextNow,
    watchCredits,
  };
}
