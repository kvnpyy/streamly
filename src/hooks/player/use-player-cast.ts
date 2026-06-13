"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CastMediaDescriptor } from "@/lib/cast-media-url";
import { waitForCastPlaylistReady } from "@/lib/cast-media-url";
import { resolveCastLiveHlsUrl } from "@/lib/cast-live-hls";
import {
  CAST_SENDER_SCRIPT_SRC,
  shouldAttemptChromecastSenderLoad,
} from "@/lib/player-cast";
import type { PlayerSource } from "@/store/player";

export type CastSenderUiState =
  | "inactive"
  | "loading"
  | "ready"
  | "unsupported"
  | "failed";

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    cast?: {
      framework: {
        CastContext: {
          getInstance: () => {
            setOptions: (o: unknown) => void;
            requestSession: () => Promise<unknown>;
            getCastState?: () => number;
            getCurrentSession?: () => {
              loadMedia: (r: unknown) => Promise<void>;
            } | null;
          };
        };
        CastState?: {
          CONNECTED: number;
          NOT_CONNECTED: number;
          CONNECTING: number;
        };
      };
    };
    chrome?: {
      cast?: {
        AutoJoinPolicy: { ORIGIN_SCOPED: string };
        media: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: string;
          StreamType?: { LIVE: number; BUFFERED: number };
          MediaInfo: new (url: string, contentType: string) => unknown;
          LoadRequest: new (mediaInfo: unknown) => unknown;
        };
      };
    };
  }
}

export type UsePlayerCastParams = {
  open: boolean;
  showShare: boolean;
  silkLikeClient: boolean;
  castMedia: CastMediaDescriptor | null;
  current: PlayerSource | null;
  onCastStarted: () => void;
};

/** Chromecast Web Sender SDK — loads when share panel opens (or desktop non-Silk). */
export function usePlayerCast({
  open,
  showShare,
  silkLikeClient,
  castMedia,
  current,
  onCastStarted,
}: UsePlayerCastParams) {
  const [castSenderState, setCastSenderState] =
    useState<CastSenderUiState>("inactive");
  const [castActionMessage, setCastActionMessage] = useState<string | null>(
    null
  );
  const castSdkReadyRef = useRef(false);

  const shouldInitCastSdk = open && (!silkLikeClient || showShare);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setCastSenderState("inactive");
        setCastActionMessage(null);
      });
      return;
    }
    if (typeof window === "undefined") return;
    if (!shouldInitCastSdk) return;

    if (!shouldAttemptChromecastSenderLoad()) {
      queueMicrotask(() => setCastSenderState("unsupported"));
      return;
    }

    if (castSdkReadyRef.current && window.cast?.framework) {
      queueMicrotask(() => setCastSenderState("ready"));
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let giveUpTimer: number | null = null;
    let completed = false;

    const clearTimers = () => {
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      if (giveUpTimer != null) {
        window.clearTimeout(giveUpTimer);
        giveUpTimer = null;
      }
    };

    const fail = () => {
      if (cancelled || completed) return;
      completed = true;
      clearTimers();
      queueMicrotask(() => setCastSenderState("failed"));
    };

    const succeed = () => {
      if (cancelled || completed) return;
      completed = true;
      clearTimers();
      castSdkReadyRef.current = true;
      queueMicrotask(() => setCastSenderState("ready"));
    };

    let castOptionsApplied = false;

    const tryInitCastOptions = (): boolean => {
      try {
        const fw = window.cast?.framework;
        const chromeCast = window.chrome?.cast;
        if (!fw || !chromeCast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID) {
          return false;
        }
        if (!castOptionsApplied) {
          fw.CastContext.getInstance().setOptions({
            receiverApplicationId:
              chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: chromeCast.AutoJoinPolicy?.ORIGIN_SCOPED,
          });
          castOptionsApplied = true;
        }
        return true;
      } catch {
        return false;
      }
    };

    const tryComplete = () => {
      if (cancelled || completed) return;
      if (window.cast?.framework && tryInitCastOptions()) succeed();
    };

    if (window.cast?.framework && tryInitCastOptions()) {
      succeed();
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => setCastSenderState("loading"));

    pollTimer = window.setInterval(() => {
      tryComplete();
    }, 200);

    giveUpTimer = window.setTimeout(() => {
      if (cancelled || completed) return;
      clearTimers();
      if (window.cast?.framework && tryInitCastOptions()) succeed();
      else fail();
    }, 14_000);

    const prevGCastCb = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (available: boolean) => {
      try {
        prevGCastCb?.(available);
      } catch {
        /* noop */
      }
      if (cancelled || completed) return;
      if (!available) {
        fail();
        return;
      }
      queueMicrotask(tryComplete);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CAST_SENDER_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", tryComplete, { once: true });
      queueMicrotask(tryComplete);
      if (existing.dataset.castSenderLoaded === "1") queueMicrotask(tryComplete);
    } else {
      const s = document.createElement("script");
      s.src = CAST_SENDER_SCRIPT_SRC;
      s.async = true;
      s.addEventListener("load", () => {
        s.dataset.castSenderLoaded = "1";
        tryComplete();
      });
      document.head.appendChild(s);
    }

    return () => {
      cancelled = true;
      clearTimers();
      if (prevGCastCb) window.__onGCastApiAvailable = prevGCastCb;
      else delete window.__onGCastApiAvailable;
    };
  }, [open, shouldInitCastSdk]);

  const cast = useCallback(async () => {
    if (!castMedia) return;
    setCastActionMessage(null);
    try {
      const ctx = window.cast?.framework?.CastContext?.getInstance?.();
      if (!ctx) {
        setCastActionMessage(
          "Cast isn’t ready yet. Wait a moment, refresh the page, or use Copy stream URL."
        );
        window.setTimeout(() => setCastActionMessage(null), 8000);
        return;
      }
      const fw = window.cast?.framework;
      const CastState = fw?.CastState;
      const alreadyConnected =
        CastState != null &&
        ctx.getCastState?.() === CastState.CONNECTED &&
        ctx.getCurrentSession?.();
      if (!alreadyConnected) {
        await ctx.requestSession();
      }
      const ChromeMedia = window.chrome?.cast?.media;
      if (!ChromeMedia?.MediaInfo || !ChromeMedia.LoadRequest) {
        setCastActionMessage(
          "This browser doesn’t expose Chromecast media APIs. Try Chrome or Edge, or copy the stream URL."
        );
        window.setTimeout(() => setCastActionMessage(null), 8000);
        return;
      }

      setCastActionMessage("Preparing stream for your TV…");
      let playUrl = castMedia.url;
      try {
        if (castMedia.streamType === "live") {
          playUrl = await resolveCastLiveHlsUrl(castMedia.url);
        }
        await waitForCastPlaylistReady(playUrl, { timeoutMs: 45_000 });
      } catch (prepErr) {
        const msg =
          prepErr instanceof Error && prepErr.message
            ? prepErr.message
            : "Could not prepare stream for your TV.";
        setCastActionMessage(
          `${msg} Try again in a moment, or copy the stream URL for VLC on your TV.`
        );
        window.setTimeout(() => setCastActionMessage(null), 10_000);
        return;
      }
      setCastActionMessage(null);

      const mediaInfo = new ChromeMedia.MediaInfo(
        playUrl,
        castMedia.contentType
      ) as {
        streamType?: number;
        metadata?: { type: number; title?: string };
      };
      if (ChromeMedia.StreamType) {
        mediaInfo.streamType =
          castMedia.streamType === "live"
            ? ChromeMedia.StreamType.LIVE
            : ChromeMedia.StreamType.BUFFERED;
      }
      try {
        const title = current?.title ?? "Stream";
        const CM = ChromeMedia as typeof ChromeMedia & {
          MetadataType?: { GENERIC: number };
          GenericMediaMetadata?: new () => { type: number; title?: string };
        };
        if (CM.MetadataType && CM.GenericMediaMetadata) {
          const meta = new CM.GenericMediaMetadata();
          meta.type = CM.MetadataType.GENERIC;
          meta.title = title;
          mediaInfo.metadata = meta;
        }
      } catch {
        /* metadata optional */
      }

      const request = new ChromeMedia.LoadRequest(mediaInfo);
      const session = ctx.getCurrentSession?.();
      if (!session) {
        setCastActionMessage(
          "No Cast session. Pick your Chromecast or Google TV again, or copy the stream URL."
        );
        window.setTimeout(() => setCastActionMessage(null), 8000);
        return;
      }
      await session.loadMedia(request);
      onCastStarted();
    } catch (err) {
      const code =
        err &&
        typeof err === "object" &&
        "code" in err &&
        typeof (err as { code: unknown }).code === "string"
          ? (err as { code: string }).code
          : err &&
              typeof err === "object" &&
              "code" in err &&
              typeof (err as { code: unknown }).code === "number"
            ? String((err as { code: number }).code)
            : null;
      setCastActionMessage(
        code
          ? `Cast failed (${code}). Try again, use another receiver, or copy the stream URL for VLC on your TV.`
          : "Cast failed. Try again, move to the same Wi‑Fi as your TV, or copy the stream URL for VLC / your provider app."
      );
      window.setTimeout(() => setCastActionMessage(null), 9000);
      if (process.env.NODE_ENV !== "production") {
        console.warn("Cast failed", err);
      }
    }
  }, [castMedia, current, onCastStarted]);

  return {
    castSenderState,
    castActionMessage,
    cast,
  };
}
