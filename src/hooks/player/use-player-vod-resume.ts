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
    restartTranscodeAtSeek,
  } = p;

  /** One-shot resume when the player opens — never re-run on transcode URL swaps. */
  useEffect(() => {
    vodResumeLockedRef.current = false;
  }, [open, current?.url, current?.id, vodResumeLockedRef]);

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
      vodResumeLockedRef.current = true;
      if (absolute >= d - 25) return;

      const hls = hlsRef.current;
      if (hls && usesTranscode) {
        const encoded = vodEncodedSecRef.current;
        const rel = vodRelativeSec(absolute, {
          usesTranscode: true,
          startOffsetSec: off,
        });
        if (rel >= 0 && encoded >= 2 && rel < encoded - 1) {
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
        } else {
          restartTranscodeAtSeek(absolute);
        }
        return;
      }

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
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onDurationChange);
    };
  }, [
    open,
    current,
    isLive,
    creds,
    restartTranscodeAtSeek,
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
  ]);

  useEffect(() => {
    if (!open) vodResumeLockedRef.current = false;
  }, [open, vodResumeLockedRef]);
}
