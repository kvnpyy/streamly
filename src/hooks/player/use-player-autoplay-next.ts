"use client";

import {
  AUTOPLAY_COUNTDOWN_SEC,
  autoplayDisplayCountdownSec,
  episodeAutoplayKey,
  getSeriesNextEpisode,
  shouldAutoplayOnEnded,
  shouldOfferAutoplayNext,
} from "@/lib/player-autoplay-next";
import { shouldTreatTranscodeAsEnded } from "@/lib/player-transcode-playback-end";
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
  usesTranscode?: boolean;
  startOffsetSecRef?: RefObject<number>;
  encodedSecRelRef?: RefObject<number>;
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
    usesTranscode = false,
    startOffsetSecRef,
    encodedSecRelRef,
  } = p;

  const nextEpisode = useMemo(
    () => getSeriesNextEpisode(playlist, index),
    [playlist, index]
  );
  const episodeKey = current ? episodeAutoplayKey(current) : null;
  const hasNextEpisode = nextEpisode != null;

  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [watchCreditsKey, setWatchCreditsKey] = useState<string | null>(null);
  const [finaleOffer, setFinaleOffer] = useState(false);
  const [finaleCountdown, setFinaleCountdown] = useState<number | null>(null);
  const advancedRef = useRef(false);
  const onPlayNextRef = useRef(onPlayNext);

  useEffect(() => {
    onPlayNextRef.current = onPlayNext;
  }, [onPlayNext]);

  useEffect(() => {
    advancedRef.current = false;
    queueMicrotask(() => setFinaleCountdown(null));
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
    if (positionCountdownSec === 0) advanceToNext();
  }, [positionCountdownSec, advanceToNext]);

  useEffect(() => {
    if (!usesTranscode || !open || dismissedForEpisode || watchCreditsForEpisode) {
      return () => setFinaleOffer(false);
    }
    const tick = () => {
      const v = videoRef.current;
      if (!v) {
        setFinaleOffer(false);
        return;
      }
      setFinaleOffer(
        shouldTreatTranscodeAsEnded({
          video: v,
          startOffsetSec: startOffsetSecRef?.current ?? 0,
          durationSec,
          encodedSecRel: encodedSecRelRef?.current ?? 0,
        })
      );
    };
    tick();
    const timer = window.setInterval(tick, 1500);
    return () => {
      window.clearInterval(timer);
      setFinaleOffer(false);
    };
  }, [
    usesTranscode,
    open,
    dismissedForEpisode,
    watchCreditsForEpisode,
    durationSec,
    videoRef,
    startOffsetSecRef,
    encodedSecRelRef,
  ]);

  const showFinaleCard =
    finaleOffer && hasNextEpisode && !dismissedForEpisode && !watchCreditsForEpisode;

  useEffect(() => {
    if (!showFinaleCard) {
      queueMicrotask(() => setFinaleCountdown(null));
      return;
    }
    queueMicrotask(() => setFinaleCountdown(AUTOPLAY_COUNTDOWN_SEC));
  }, [showFinaleCard, episodeKey]);

  useEffect(() => {
    if (finaleCountdown == null || finaleCountdown <= 0) return;
    const timer = window.setTimeout(() => {
      setFinaleCountdown((c) => (c == null || c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [finaleCountdown]);

  useEffect(() => {
    if (finaleCountdown === 0) advanceToNext();
  }, [finaleCountdown, advanceToNext]);

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
    showFinaleCard
      ? finaleCountdown != null && finaleCountdown > 0
        ? finaleCountdown
        : null
      : positionCountdownSec != null && positionCountdownSec > 0
        ? positionCountdownSec
        : null;

  return {
    visible:
      hasNextEpisode &&
      !dismissedForEpisode &&
      !watchCreditsForEpisode &&
      ((shouldOffer && visibleCountdown != null) || showFinaleCard),
    nextEpisode,
    countdownSec: visibleCountdown,
    cancelAutoplay,
    playNextNow,
    watchCredits,
  };
}
