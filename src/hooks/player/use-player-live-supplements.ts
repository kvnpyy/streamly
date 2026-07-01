"use client";

import { useEffect, type RefObject } from "react";
import type Hls from "hls.js";
import { isAppleMobileWebKitDevice } from "@/lib/browser";
import { tryCapAbrLower } from "@/lib/live-hls-playback";
import { withLiveHlsCompatMse } from "@/lib/stream-url";
import { isTvClassUserAgent } from "@/lib/tv-user-agent";
import { warmSeriesPlaylistNeighbor } from "@/lib/vod-transcode-url";
import { voidSafeVideoPlay } from "@/lib/video-play";
import type { PlayerSource } from "@/store/player";
import type { PlayerPlaylist } from "@/store/player";

export type UsePlayerLiveSupplementsParams = {
  open: boolean;
  current: PlayerSource | null;
  chromiumDesktopClient: boolean;
  silkLikeClient: boolean;
  mobileLikeViewport: boolean;
  tvBrowser: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  playlist: PlayerPlaylist | null;
  index: number;
};

/** Live ABR downshift on repeated `waiting`, playlist warm, tab visibility reload. */
export function usePlayerLiveSupplements(p: UsePlayerLiveSupplementsParams) {
  const {
    open,
    current,
    chromiumDesktopClient,
    silkLikeClient,
    mobileLikeViewport,
    tvBrowser,
    videoRef,
    hlsRef,
    playlist,
    index,
  } = p;

  useEffect(() => {
    if (!open || !current) return;
    if (isAppleMobileWebKitDevice()) return;
    if (
      current.kind === "live" &&
      (chromiumDesktopClient ||
        (typeof navigator !== "undefined" &&
          isTvClassUserAgent(navigator.userAgent || "")))
    ) {
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const win = { n: 0, t0: 0 };
    const onWaiting = () => {
      const now = Date.now();
      if (now - win.t0 > 20_000) {
        win.n = 0;
        win.t0 = now;
      }
      win.n += 1;
      const h = hlsRef.current;
      if (!h?.levels?.length || win.n < 3) return;
      win.n = 0;
      tryCapAbrLower(h);
    };
    const reset = () => {
      win.n = 0;
      win.t0 = Date.now();
    };
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", reset);
    video.addEventListener("seeked", reset);
    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", reset);
      video.removeEventListener("seeked", reset);
    };
  }, [open, current, chromiumDesktopClient, videoRef, hlsRef]);

  useEffect(() => {
    if (!open || !playlist || playlist.items.length < 2 || index < 0) return;
    if (silkLikeClient || mobileLikeViewport) return;
    const items = playlist.items;
    const n = items.length;
    const compatMse = tvBrowser || silkLikeClient;

    if (playlist.kind === "series") {
      const warmNeighbor = (i: number) => {
        const item = items[i];
        if (!item) return;
        warmSeriesPlaylistNeighbor(item, { compatMse });
      };
      warmNeighbor((index + 1) % n);
      warmNeighbor((index - 1 + n) % n);
      return;
    }

    const warm = (i: number) => {
      const u = items[i]?.url;
      if (!u) return;
      const ac = new AbortController();
      const kill = setTimeout(() => ac.abort(), 12000);
      fetch(u, { cache: "no-store", signal: ac.signal })
        .catch(() => {})
        .finally(() => clearTimeout(kill));
    };
    warm((index + 1) % n);
    warm((index - 1 + n) % n);
  }, [open, playlist, index, silkLikeClient, mobileLikeViewport, tvBrowser]);

  useEffect(() => {
    if (!open || !current || current.kind !== "live") return;
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (
        document.visibilityState === "visible" &&
        hiddenAt > 0 &&
        Date.now() - hiddenAt > 5000 &&
        !hlsRef.current &&
        videoRef.current &&
        current.url
      ) {
        if (isAppleMobileWebKitDevice()) {
          hiddenAt = 0;
          return;
        }
        const v = videoRef.current;
        const u = withLiveHlsCompatMse(current.url, true);
        try {
          v.pause();
          v.removeAttribute("src");
          v.load();
          v.src = u;
          voidSafeVideoPlay(v);
        } catch {
          /* noop */
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open, current, videoRef, hlsRef]);
}
