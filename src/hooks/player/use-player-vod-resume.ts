"use client";

import { useEffect, type RefObject } from "react";
import type Hls from "hls.js";
import {
  resolveStoredVodResumeSec,
  shouldPersistVodResume,
  vodAbsoluteSec,
  vodRelativeSec,
  vodResumeStorageKey,
} from "@/lib/player-vod-resume";
import { shouldSuppressVodTipPersist } from "@/lib/player-vod-seek-land";
import { playbackUrlUsesVodTranscode } from "@/lib/vod-transcode-url";
import type { PlayerSource } from "@/store/player";
import { browseAccountKey, usePrefs } from "@/store/preferences";

export type UsePlayerVodResumeParams = {
  open: boolean;
  current: PlayerSource | null;
  isLive: boolean;
  creds: { server: string; username: string; password: string } | null;
  vodPlaybackUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  vodDurationHintRef: RefObject<number>;
  vodStartOffsetRef: RefObject<number>;
  vodEncodedSecRef: RefObject<number>;
  /** Once true, initial resume must not run again this player session. */
  vodResumeLockedRef: RefObject<boolean>;
  vodScrubbingRef: RefObject<boolean>;
  vodSeekSuppressTipPersistUntilRef: RefObject<number>;
  restartTranscodeAtSeek: (absoluteSec: number) => void;
};

/** VOD: resume on open + periodic save of playback position. */
export function usePlayerVodResume(p: UsePlayerVodResumeParams) {
  const {
    open,
    current,
    isLive,
    creds,
    vodPlaybackUrl,
    videoRef,
    hlsRef,
    vodDurationHintRef,
    vodStartOffsetRef,
    vodEncodedSecRef,
    vodResumeLockedRef,
    vodScrubbingRef,
    vodSeekSuppressTipPersistUntilRef,
    restartTranscodeAtSeek: _restartTranscodeAtSeek,
  } = p;

  /** One-shot resume when the player opens — never re-run on transcode URL swaps. */
  useEffect(() => {
    if (!open || !current || isLive || !creds) return;
    if (vodResumeLockedRef.current) return;

    const video = videoRef.current;
    if (!video) return;
    const key = vodResumeStorageKey(browseAccountKey(creds), current);
    if (!key) return;

    const stored = usePrefs.getState().getVodResume(key);
    if (stored == null || stored < 15) {
      vodResumeLockedRef.current = true;
      return;
    }

    const activeUrl = vodPlaybackUrl ?? current.url;
    const usesTranscode = playbackUrlUsesVodTranscode(activeUrl);

    // When the active URL already carries tc_seek, still apply stored resume
    // into the playlist — server may reuse a from-0 encode (offset 0).
    let disposed = false;

    const readDuration = () => {
      const hint = vodDurationHintRef.current;
      if (hint > 1) return hint;
      const vd = video.duration;
      if (usesTranscode) return 0;
      return Number.isFinite(vd) && vd > 1 && vd < 86400 ? vd : 0;
    };

    const trySeek = () => {
      if (disposed || vodResumeLockedRef.current) return;
      const d = readDuration();
      if (!d || d < 30) return;

      const off = vodStartOffsetRef.current;
      const absolute = resolveStoredVodResumeSec(stored, off);
      if (absolute >= d - 25) {
        vodResumeLockedRef.current = true;
        return;
      }

      if (usesTranscode) {
        const hls = hlsRef.current;
        // Wait for hls.js — locking + native currentTime here permanently
        // skipped in-playlist resume and raced autoplay.
        if (!hls) return;
        const encoded = vodEncodedSecRef.current;
        // Duration often arrives in the same XHR before encodedSec is written —
        // locking here left resume stuck at 0:00 with a seek overlay.
        if (encoded < 2) return;

        // Already landed (e.g. MANIFEST_PARSED hold seek succeeded).
        const nowAbs = off + (Number.isFinite(video.currentTime) ? video.currentTime : 0);
        if (Math.abs(nowAbs - absolute) < 20 && nowAbs > 5) {
          vodResumeLockedRef.current = true;
          return;
        }

        // Target still beyond encoded tip — wait for more segments; do not fork
        // a seek job from resume (that created the tip-only / ~6min snap bugs).
        if (absolute > off + encoded + 15) return;

        const rel = vodRelativeSec(absolute, {
          usesTranscode: true,
          startOffsetSec: off,
        });
        try {
          hls.startLoad(Math.max(0, rel));
        } catch {
          /* noop */
        }
        try {
          video.currentTime = Math.max(0, rel);
        } catch {
          /* noop */
        }
        try {
          void video.play();
        } catch {
          /* autoplay policy — tap-to-play UI handles it */
        }
        // Lock only once the element time reflects the resume target.
        const landed = off + (Number.isFinite(video.currentTime) ? video.currentTime : 0);
        if (Math.abs(landed - absolute) < 20) {
          vodResumeLockedRef.current = true;
        }
        return;
      }

      vodResumeLockedRef.current = true;
      try {
        video.currentTime = absolute;
      } catch {
        /* noop */
      }
    };

    const onMeta = () => trySeek();
    const onDurationChange = () => trySeek();

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onDurationChange);
    const raf = requestAnimationFrame(() => trySeek());
    // Encoded coverage arrives via XHR headers (no media event) — poll briefly.
    const poll = window.setInterval(() => trySeek(), 250);
    const pollStop = window.setTimeout(() => window.clearInterval(poll), 45_000);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.clearTimeout(pollStop);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onDurationChange);
    };
  }, [
    open,
    current,
    isLive,
    creds,
    videoRef,
    hlsRef,
    vodDurationHintRef,
    vodStartOffsetRef,
    vodEncodedSecRef,
    vodResumeLockedRef,
    vodPlaybackUrl,
  ]);

  /** Persist wall-clock position — stable across transcode seek reloads. */
  useEffect(() => {
    if (!open || !current || isLive || !creds) return;
    const video = videoRef.current;
    if (!video) return;
    const key = vodResumeStorageKey(browseAccountKey(creds), current);
    if (!key) return;

    const activeUrl = vodPlaybackUrl ?? current.url;
    const usesTranscode = playbackUrlUsesVodTranscode(activeUrl);
    let lastPersist = 0;

    const readDuration = () => {
      const hint = vodDurationHintRef.current;
      if (hint > 1) return hint;
      const vd = video.duration;
      if (usesTranscode) return 0;
      return Number.isFinite(vd) && vd > 1 && vd < 86400 ? vd : 0;
    };

    const onEnded = () => usePrefs.getState().clearVodResume(key);
    const onTime = () => {
      if (vodScrubbingRef.current) return;
      if (
        shouldSuppressVodTipPersist(
          Date.now(),
          vodSeekSuppressTipPersistUntilRef.current
        )
      ) {
        return;
      }
      const off = vodStartOffsetRef.current;
      const absolute = vodAbsoluteSec(video.currentTime, {
        usesTranscode,
        startOffsetSec: off,
      });
      const d = readDuration();
      if (!d || absolute - lastPersist < 7) return;
      if (!shouldPersistVodResume(absolute, d)) return;
      lastPersist = absolute;
      usePrefs.getState().saveVodResume(key, absolute);
    };

    video.addEventListener("ended", onEnded);
    video.addEventListener("timeupdate", onTime);
    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [
    open,
    current,
    isLive,
    creds,
    vodPlaybackUrl,
    videoRef,
    vodDurationHintRef,
    vodStartOffsetRef,
    vodScrubbingRef,
    vodSeekSuppressTipPersistUntilRef,
  ]);

  useEffect(() => {
    if (!open) vodResumeLockedRef.current = false;
  }, [open, vodResumeLockedRef]);
}
