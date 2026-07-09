"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CastMediaDescriptor } from "@/lib/cast-media-url";
import {
  isCastPreparedMediaFresh,
  prepareCastPlayUrl,
  resolveLiveCastUrlViaServer,
  type CastPreparedMedia,
} from "@/lib/cast-prepare";
import { buildImageProxyAbsolute } from "@/lib/image-proxy";
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
            addEventListener?: (
              type: string,
              listener: (event: unknown) => void
            ) => void;
            removeEventListener?: (
              type: string,
              listener: (event: unknown) => void
            ) => void;
            getCurrentSession?: () => {
              loadMedia: (r: unknown) => Promise<void>;
              getMediaSession?: () => {
                playerState?: number;
                idleReason?: number;
                addUpdateListener: (
                  listener: (isAlive: boolean) => void
                ) => number;
                removeUpdateListener: (listenerId: number) => void;
              } | null;
            } | null;
          };
        };
        CastState?: {
          CONNECTED: number;
          NOT_CONNECTED: number;
          CONNECTING: number;
        };
        CastContextEventType?: {
          CAST_STATE_CHANGED: string;
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
          PlayerState?: { IDLE: number };
          IdleReason?: { ERROR: number };
          MetadataType?: { GENERIC: number };
          GenericMediaMetadata?: new () => {
            type: number;
            title?: string;
            images?: Array<{ url: string }>;
          };
          Image?: new (url: string) => { url: string };
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
  /** Active hls.js media playlist URL while live is playing in the browser. */
  getLiveHlsManifestUrl?: () => string | null;
  onCastStarted: () => void;
};

function isCastSessionConnected(): boolean {
  try {
    const fw = window.cast?.framework;
    const ctx = fw?.CastContext?.getInstance?.();
    const CastState = fw?.CastState;
    if (!ctx || CastState == null) return false;
    return (
      ctx.getCastState?.() === CastState.CONNECTED &&
      Boolean(ctx.getCurrentSession?.())
    );
  } catch {
    return false;
  }
}

/** Chromecast Web Sender SDK — loads when share panel opens (or desktop non-Silk). */
export function usePlayerCast({
  open,
  showShare,
  silkLikeClient,
  castMedia,
  current,
  getLiveHlsManifestUrl,
  onCastStarted,
}: UsePlayerCastParams) {
  const [castSenderState, setCastSenderState] =
    useState<CastSenderUiState>("inactive");
  const [castActionMessage, setCastActionMessage] = useState<string | null>(
    null
  );
  const [castSessionConnected, setCastSessionConnected] = useState(false);
  const castSdkReadyRef = useRef(false);
  const preparedRef = useRef<CastPreparedMedia | null>(null);
  const prepAbortRef = useRef<AbortController | null>(null);
  const loadInFlightRef = useRef(false);
  const lastAutoLoadedSourceRef = useRef<string | null>(null);
  const castMediaRef = useRef(castMedia);
  const currentRef = useRef(current);
  const getLiveHlsManifestUrlRef = useRef(getLiveHlsManifestUrl);
  const onCastStartedRef = useRef(onCastStarted);

  castMediaRef.current = castMedia;
  currentRef.current = current;
  getLiveHlsManifestUrlRef.current = getLiveHlsManifestUrl;
  onCastStartedRef.current = onCastStarted;

  const shouldInitCastSdk = open && (!silkLikeClient || showShare);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setCastSenderState("inactive");
        setCastActionMessage(null);
        setCastSessionConnected(false);
      });
      preparedRef.current = null;
      lastAutoLoadedSourceRef.current = null;
      prepAbortRef.current?.abort();
      prepAbortRef.current = null;
      return;
    }
    if (typeof window === "undefined") return;
    if (!shouldInitCastSdk) return;

    if (!shouldAttemptChromecastSenderLoad()) {
      queueMicrotask(() => setCastSenderState("unsupported"));
      return;
    }

    if (castSdkReadyRef.current && window.cast?.framework) {
      let castStateListener: ((event: unknown) => void) | null = null;
      queueMicrotask(() => {
        setCastSenderState("ready");
        setCastSessionConnected(isCastSessionConnected());
      });
      try {
        const fw = window.cast?.framework;
        const ctx = fw?.CastContext?.getInstance?.();
        const eventType = fw?.CastContextEventType?.CAST_STATE_CHANGED;
        if (ctx?.addEventListener && eventType) {
          castStateListener = () => {
            setCastSessionConnected(isCastSessionConnected());
          };
          ctx.addEventListener(eventType, castStateListener);
        }
      } catch {
        /* optional */
      }
      return () => {
        if (castStateListener) {
          try {
            const fw = window.cast?.framework;
            const ctx = fw?.CastContext?.getInstance?.();
            const eventType = fw?.CastContextEventType?.CAST_STATE_CHANGED;
            if (ctx?.removeEventListener && eventType) {
              ctx.removeEventListener(eventType, castStateListener);
            }
          } catch {
            /* noop */
          }
        }
      };
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let giveUpTimer: number | null = null;
    let completed = false;
    let castStateListener: ((event: unknown) => void) | null = null;

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
      queueMicrotask(() => {
        setCastSenderState("ready");
        setCastSessionConnected(isCastSessionConnected());
      });

      try {
        const fw = window.cast?.framework;
        const ctx = fw?.CastContext?.getInstance?.();
        const eventType = fw?.CastContextEventType?.CAST_STATE_CHANGED;
        if (ctx?.addEventListener && eventType) {
          castStateListener = () => {
            setCastSessionConnected(isCastSessionConnected());
          };
          ctx.addEventListener(eventType, castStateListener);
        }
      } catch {
        /* optional */
      }
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
        if (castStateListener) {
          try {
            const fw = window.cast?.framework;
            const ctx = fw?.CastContext?.getInstance?.();
            const eventType = fw?.CastContextEventType?.CAST_STATE_CHANGED;
            if (ctx?.removeEventListener && eventType) {
              ctx.removeEventListener(eventType, castStateListener);
            }
          } catch {
            /* noop */
          }
        }
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
      if (castStateListener) {
        try {
          const fw = window.cast?.framework;
          const ctx = fw?.CastContext?.getInstance?.();
          const eventType = fw?.CastContextEventType?.CAST_STATE_CHANGED;
          if (ctx?.removeEventListener && eventType) {
            ctx.removeEventListener(eventType, castStateListener);
          }
        } catch {
          /* noop */
        }
      }
    };
  }, [open, shouldInitCastSdk]);

  /** Background pre-warm while the user watches in-browser. */
  useEffect(() => {
    if (!open || !castMedia) {
      preparedRef.current = null;
      prepAbortRef.current?.abort();
      prepAbortRef.current = null;
      return;
    }
    if (castMedia.blockedReason) {
      preparedRef.current = null;
      return;
    }
    if (
      isCastPreparedMediaFresh(preparedRef.current, castMedia.url)
    ) {
      return;
    }

    prepAbortRef.current?.abort();
    const ac = new AbortController();
    prepAbortRef.current = ac;
    preparedRef.current = null;

    const timer = window.setTimeout(() => {
      void prepareCastPlayUrl(castMedia, {
        origin: window.location.origin,
        getLiveHlsManifestUrl: getLiveHlsManifestUrlRef.current,
        signal: ac.signal,
        resolveLiveViaServer: (manifestUrl) =>
          resolveLiveCastUrlViaServer(manifestUrl, {
            signal: ac.signal,
            origin: window.location.origin,
          }),
        timeoutMs: 45_000,
      })
        .then((prepared) => {
          if (ac.signal.aborted) return;
          if (castMediaRef.current?.url !== prepared.sourceUrl) return;
          preparedRef.current = prepared;
        })
        .catch(() => {
          /* pre-warm is best-effort; cast() will retry */
        });
    }, 800);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [open, castMedia]);

  const loadPreparedOntoSession = useCallback(
    async (opts?: { requestSessionIfNeeded?: boolean; quiet?: boolean }) => {
      const media = castMediaRef.current;
      const src = currentRef.current;
      if (!media) return false;
      if (media.blockedReason) {
        if (!opts?.quiet) {
          setCastActionMessage(media.blockedReason);
          window.setTimeout(() => setCastActionMessage(null), 10_000);
        }
        return false;
      }

      const ctx = window.cast?.framework?.CastContext?.getInstance?.();
      if (!ctx) {
        if (!opts?.quiet) {
          setCastActionMessage(
            "Cast isn’t ready yet. Wait a moment, refresh the page, or use Copy TV-safe stream URL."
          );
          window.setTimeout(() => setCastActionMessage(null), 8000);
        }
        return false;
      }

      const fw = window.cast?.framework;
      const CastState = fw?.CastState;
      const alreadyConnected =
        CastState != null &&
        ctx.getCastState?.() === CastState.CONNECTED &&
        ctx.getCurrentSession?.();
      if (!alreadyConnected) {
        if (!opts?.requestSessionIfNeeded) return false;
        await ctx.requestSession();
      }

      const ChromeMedia = window.chrome?.cast?.media;
      if (!ChromeMedia?.MediaInfo || !ChromeMedia.LoadRequest) {
        if (!opts?.quiet) {
          setCastActionMessage(
            "This browser doesn’t expose Chromecast media APIs. Try Chrome or Edge, or copy the TV-safe stream URL."
          );
          window.setTimeout(() => setCastActionMessage(null), 8000);
        }
        return false;
      }

      let prepared = isCastPreparedMediaFresh(preparedRef.current, media.url)
        ? preparedRef.current
        : null;

      if (!prepared) {
        if (!opts?.quiet) {
          setCastActionMessage("Preparing stream for your TV…");
        }
        try {
          prepared = await prepareCastPlayUrl(media, {
            origin: window.location.origin,
            getLiveHlsManifestUrl: getLiveHlsManifestUrlRef.current,
            resolveLiveViaServer: (manifestUrl) =>
              resolveLiveCastUrlViaServer(manifestUrl, {
                origin: window.location.origin,
              }),
            timeoutMs: 45_000,
          });
          preparedRef.current = prepared;
        } catch (prepErr) {
          const msg =
            prepErr instanceof Error && prepErr.message
              ? prepErr.message
              : "Could not prepare stream for your TV.";
          if (!opts?.quiet) {
            setCastActionMessage(
              `${msg} Try again in a moment, or copy the TV-safe stream URL for VLC on your TV.`
            );
            window.setTimeout(() => setCastActionMessage(null), 10_000);
          }
          return false;
        }
      }

      if (!opts?.quiet) setCastActionMessage(null);

      const mediaInfo = new ChromeMedia.MediaInfo(
        prepared.playUrl,
        prepared.contentType || "application/x-mpegURL"
      ) as {
        streamType?: number;
        metadata?: {
          type: number;
          title?: string;
          images?: Array<{ url: string }>;
        };
      };
      if (ChromeMedia.StreamType) {
        mediaInfo.streamType =
          prepared.streamType === "live"
            ? ChromeMedia.StreamType.LIVE
            : ChromeMedia.StreamType.BUFFERED;
      }
      try {
        const title = src?.title ?? "Stream";
        const CM = ChromeMedia;
        if (CM.MetadataType && CM.GenericMediaMetadata) {
          const meta = new CM.GenericMediaMetadata();
          meta.type = CM.MetadataType.GENERIC;
          meta.title = title;
          const poster = src?.poster
            ? buildImageProxyAbsolute(src.poster)
            : undefined;
          if (poster) {
            if (CM.Image) {
              meta.images = [new CM.Image(poster)];
            } else {
              meta.images = [{ url: poster }];
            }
          }
          mediaInfo.metadata = meta;
        }
      } catch {
        /* metadata optional */
      }

      const request = new ChromeMedia.LoadRequest(mediaInfo) as {
        autoplay?: boolean;
      };
      request.autoplay = true;
      const session = ctx.getCurrentSession?.();
      if (!session) {
        if (!opts?.quiet) {
          setCastActionMessage(
            "No Cast session. Pick your Chromecast or Google TV again, or copy the TV-safe stream URL."
          );
          window.setTimeout(() => setCastActionMessage(null), 8000);
        }
        return false;
      }
      await session.loadMedia(request);
      setCastSessionConnected(true);
      lastAutoLoadedSourceRef.current = media.url;

      const mediaSession = session.getMediaSession?.();
      if (mediaSession && ChromeMedia.PlayerState && ChromeMedia.IdleReason) {
        const playerState = ChromeMedia.PlayerState;
        const idleReason = ChromeMedia.IdleReason;
        const listenerId = mediaSession.addUpdateListener((isAlive) => {
          if (!isAlive) return;
          if (
            mediaSession.playerState === playerState.IDLE &&
            mediaSession.idleReason === idleReason.ERROR
          ) {
            setCastActionMessage(
              "Your TV could not play this stream (codec or provider block). Try another channel, or copy the TV-safe stream URL for VLC."
            );
            window.setTimeout(() => setCastActionMessage(null), 12_000);
            mediaSession.removeUpdateListener(listenerId);
          }
        });
      }

      onCastStartedRef.current();
      return true;
    },
    []
  );

  const cast = useCallback(async () => {
    if (!castMediaRef.current) return;
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setCastActionMessage(null);
    try {
      await loadPreparedOntoSession({ requestSessionIfNeeded: true });
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
          ? `Cast failed (${code}). Try again, use another receiver, or copy the TV-safe stream URL for VLC on your TV.`
          : "Cast failed. Try again, move to the same Wi‑Fi as your TV, or copy the TV-safe stream URL for VLC."
      );
      window.setTimeout(() => setCastActionMessage(null), 9000);
      if (process.env.NODE_ENV !== "production") {
        console.warn("Cast failed", err);
      }
    } finally {
      loadInFlightRef.current = false;
    }
  }, [loadPreparedOntoSession]);

  /** When already casting, follow channel / title changes automatically. */
  useEffect(() => {
    if (!open || !castMedia || castSenderState !== "ready") return;
    if (!castSessionConnected && !isCastSessionConnected()) return;
    if (castMedia.blockedReason) return;
    if (lastAutoLoadedSourceRef.current === castMedia.url) return;
    if (loadInFlightRef.current) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;
      void loadPreparedOntoSession({
        requestSessionIfNeeded: false,
        quiet: true,
      })
        .catch(() => {
          /* auto-follow is best-effort */
        })
        .finally(() => {
          loadInFlightRef.current = false;
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    open,
    castMedia,
    castSenderState,
    castSessionConnected,
    loadPreparedOntoSession,
  ]);

  return {
    castSenderState,
    castActionMessage,
    castSessionConnected,
    cast,
  };
}
