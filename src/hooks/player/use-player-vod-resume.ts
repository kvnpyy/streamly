"use client";

import { useEffect, type RefObject } from "react";
import type Hls from "hls.js";
import { vodResumeStorageKey } from "@/lib/player-vod-resume";
import { playbackUrlUsesVodTranscode } from "@/lib/vod-transcode-url";
import type { PlayerSource } from "@/store/player";
import { browseAccountKey, usePrefs } from "@/store/preferences";

export type UsePlayerVodResumeParams = {
  open: boolean;
  current: PlayerSource | null;
  isLive: boolean;
  creds: { server: string; username: string; password: string } | null;
  vodPlaybackUrl: string | null;
  vodTotalSec: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  vodDurationHintRef: RefObject<number>;
  vodStartOffsetRef: RefObject<number>;
  vodEncodedSecRef: RefObject<number>;
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
    vodTotalSec,
    videoRef,
    hlsRef,
    vodDurationHintRef,
    vodStartOffsetRef,
    vodEncodedSecRef,
    restartTranscodeAtSeek,
  } = p;

  useEffect(() => {
    if (!open || !current || isLive || !creds) return;
    const video = videoRef.current;
    if (!video) return;
    const key = vodResumeStorageKey(browseAccountKey(creds), current);
    if (!key) return;
    const target = usePrefs.getState().getVodResume(key);
    if (target == null || target < 15) return;

    let disposed = false;
    let lastPersist = 0;

    const trySeek = () => {
      if (disposed) return;
      const vd = video.duration;
      const hint = vodDurationHintRef.current || vodTotalSec;
      const d =
        vodTotalSec > 1
          ? vodTotalSec
          : Number.isFinite(vd) && vd > 1 && vd < 86400
            ? vd
            : hint > 1
              ? hint
              : 0;
      if (!d || d < 30) return;
      if (target >= d - 25) return;
      const hls = hlsRef.current;
      if (hls && playbackUrlUsesVodTranscode(vodPlaybackUrl ?? current.url)) {
        const off = vodStartOffsetRef.current;
        const encoded = vodEncodedSecRef.current;
        const rel = target - off;
        if (rel >= 0 && rel < encoded - 1) {
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
          restartTranscodeAtSeek(target);
        }
        return;
      }
      try {
        video.currentTime = target;
      } catch {
        /* noop */
      }
    };

    const onMeta = () => trySeek();
    const onEnded = () => usePrefs.getState().clearVodResume(key);
    const onTime = () => {
      const t = video.currentTime;
      const vd = video.duration;
      const d =
        vodTotalSec > 1
          ? vodTotalSec
          : Number.isFinite(vd) && vd > 1 && vd < 86400
            ? vd
            : 0;
      if (!d || t < 12 || t > d - 45 || t - lastPersist < 7) return;
      lastPersist = t;
      usePrefs.getState().saveVodResume(key, t);
    };

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("ended", onEnded);
    video.addEventListener("timeupdate", onTime);
    const raf = requestAnimationFrame(() => trySeek());
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [
    open,
    current,
    isLive,
    creds,
    vodPlaybackUrl,
    vodTotalSec,
    restartTranscodeAtSeek,
    videoRef,
    hlsRef,
    vodDurationHintRef,
    vodStartOffsetRef,
    vodEncodedSecRef,
  ]);
}
