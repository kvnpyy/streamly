"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type Hls from "hls.js";
import type { ErrorData, Level, MediaPlaylist } from "hls.js";
import { STREAM_PROXY_REQUEST_ID_HEADER } from "@/lib/request-id";
import {
  isAppleMobileWebKitDevice,
  isChromiumBasedDesktopBrowser,
  isSafariFamilyWithoutChromium,
} from "@/lib/browser";
import {
  applyGentleLiveHlsRecovery,
  LIVE_PLAYBACK_ERROR_GRACE_MS,
  indexOfLowestSafeLevel,
  levelDeclaresHevc,
  levelDeclaresNonPreferredChromePackagedAudio,
  livePlaybackStoppedMessage,
  preferBrowserFriendlyAudioTrack,
  stabilizeBrowserFriendlyCodecs,
  tryCapAbrLower,
} from "@/lib/live-hls-playback";
import { playbackBreadcrumb } from "@/lib/playback-telemetry";
import {
  buildAppleMobileLiveHlsConfig,
  buildIptvHlsJsConfig,
  buildVodTranscodeHlsJsConfig,
  levelsListKey,
} from "@/lib/iptv-hls-config";
import { playbackUrlIsHls } from "@/lib/playback-url";
import { resolveVodPlaybackUrl } from "@/lib/vod-transcode-url";
import {
  readPreferredPlayerVolume,
} from "@/lib/player-volume-pref";
import { withLiveHlsCompatMse } from "@/lib/stream-url";
import { isAmazonSilkUserAgent, isTvClassUserAgent } from "@/lib/tv-user-agent";
import { humanizePlaybackErrorResponse } from "@/lib/playback-error-message";
import {
  destroyHlsInstance,
  pauseVideoElement,
  scheduleDeferredPlayerTeardown,
} from "@/lib/player-teardown";
import { detachVideoElement, safeVideoPlay } from "@/lib/video-play";
import {
  playbackUrlUsesVodTranscode,
  releaseVodTranscodePlayback,
} from "@/lib/vod-transcode-url";
import {
  shouldPersistVodResume,
  type VodTimelineHold,
  vodAbsoluteSec,
  vodResumeStorageKey,
} from "@/lib/player-vod-resume";
import { shouldSuppressVodTipPersist } from "@/lib/player-vod-seek-land";
import { mapHlsAudioTracks } from "@/lib/player-audio-tracks";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import type { PlayerSource } from "@/store/player";
import type { useHlsRuntime } from "@/hooks/use-hls-runtime";
import type { PlayerAudioTrack } from "@/lib/player-audio-tracks";

export type UsePlayerPlaybackPipelineParams = {
  open: boolean;
  current: PlayerSource | null;
  isLive: boolean;
  creds: { server: string; username: string; password: string } | null;
  vodPlaybackUrl: string | null;
  playbackRetryKey: number;
  chromiumDesktopClient: boolean;
  tvBrowser: boolean;
  silkLikeClient: boolean;
  hlsRuntime: ReturnType<typeof useHlsRuntime>;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  streamSupportRequestIdRef: RefObject<string | null>;
  liveTryAgainStrikeRef: RefObject<number>;
  fragLoadDowngradeRef: RefObject<number>;
  probeFetchRef: RefObject<AbortController | null>;
  vodDurationHintRef: RefObject<number>;
  vodStartOffsetRef: RefObject<number>;
  vodEncodedSecRef: RefObject<number>;
  hlsLiveEdgeRestartGateRef: RefObject<number>;
  livePlaybackRecoveryGenRef: RefObject<number>;
  livePlaybackErrorSuppressUntilRef: RefObject<number>;
  userChoseAutoHlsQualityRef: RefObject<boolean>;
  userTouchedHlsQualityRef: RefObject<boolean>;
  userPickedAudioTrackRef: RefObject<boolean>;
  vodPrepKickRef: RefObject<AbortController | null>;
  vodSeekRestartTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  stallTimer: RefObject<ReturnType<typeof setTimeout> | null>;
  deferredTeardownCancelRef: RefObject<(() => void) | null>;
  requestVodTranscodeFallbackRef: RefObject<() => boolean>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStreamSupportRequestId: Dispatch<SetStateAction<string | null>>;
  setNeedsTapToPlay: Dispatch<SetStateAction<boolean>>;
  setStalled: Dispatch<SetStateAction<boolean>>;
  setTime: Dispatch<SetStateAction<number>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setVodTotalSec: Dispatch<SetStateAction<number>>;
  setLevels: Dispatch<SetStateAction<Level[]>>;
  setCurrentLevel: Dispatch<SetStateAction<number>>;
  setSubtitles: Dispatch<SetStateAction<{ id: number; label: string; lang?: string; source: "hls" | "native" }[]>>;
  setActiveSubtitle: Dispatch<SetStateAction<number>>;
  setAudioTracks: Dispatch<SetStateAction<PlayerAudioTrack[]>>;
  setActiveAudioTrack: Dispatch<SetStateAction<number>>;
  setLiveAudioNoPicture: Dispatch<SetStateAction<boolean>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setVolume: Dispatch<SetStateAction<number>>;
  setVideoHasFrame: Dispatch<SetStateAction<boolean>>;
  setVodPrepProgress: Dispatch<SetStateAction<number>>;
  applyVodDurationHint: (sec: number) => void;
  applyVodTranscodeTimelineHints: (hints: {
    startOffset?: number;
    encoded?: number;
  }) => void;
  vodTimelineHoldRef: RefObject<VodTimelineHold | null>;
  /** Locks one-shot resume when the pipeline already applied a hold seek. */
  vodResumeLockedRef?: RefObject<boolean>;
  /** While scrubbing/landing, do not tip-reinforce via frag-error startLoad. */
  vodScrubbingRef?: RefObject<boolean>;
  /** Wall-clock: skip tip resume writes after an intentional scrub. */
  vodSeekSuppressTipPersistUntilRef?: RefObject<number>;
};

export function usePlayerPlaybackPipeline(p: UsePlayerPlaybackPipelineParams) {
  const {
    open,
    current,
    isLive,
    creds,
    vodPlaybackUrl,
    playbackRetryKey,
    chromiumDesktopClient,
    tvBrowser,
    silkLikeClient,
    hlsRuntime,
    videoRef,
    hlsRef,
    streamSupportRequestIdRef,
    liveTryAgainStrikeRef,
    fragLoadDowngradeRef,
    probeFetchRef,
    vodDurationHintRef,
    vodStartOffsetRef,
    vodEncodedSecRef,
    hlsLiveEdgeRestartGateRef,
    livePlaybackRecoveryGenRef,
    livePlaybackErrorSuppressUntilRef,
    userChoseAutoHlsQualityRef,
    userTouchedHlsQualityRef,
    userPickedAudioTrackRef,
    vodPrepKickRef,
    vodSeekRestartTimerRef,
    stallTimer,
    deferredTeardownCancelRef,
    requestVodTranscodeFallbackRef,
    setError,
    setStreamSupportRequestId,
    setNeedsTapToPlay,
    setStalled,
    setTime,
    setDuration,
    setVodTotalSec,
    setLevels,
    setCurrentLevel,
    setSubtitles,
    setActiveSubtitle,
    setAudioTracks,
    setActiveAudioTrack,
    setLiveAudioNoPicture,
    setLoading,
    setVolume,
    setVideoHasFrame,
    setVodPrepProgress,
    applyVodDurationHint,
    applyVodTranscodeTimelineHints,
    vodTimelineHoldRef,
    vodResumeLockedRef,
    vodScrubbingRef,
    vodSeekSuppressTipPersistUntilRef,
  } = p;

  useEffect(() => {
    if (!open || !current) return;
    const video = videoRef.current;
    if (!video) return;

    deferredTeardownCancelRef.current?.();
    deferredTeardownCancelRef.current = null;

    const timelineHold = vodTimelineHoldRef.current;
    const pendingAbsoluteSeekSec = timelineHold?.absoluteTimeSec ?? null;
    // Do not lock resume here — MANIFEST_PARSED / resume hook must keep
    // retrying until the playhead actually lands near the target.

    setError(null);
    streamSupportRequestIdRef.current = null;
    setStreamSupportRequestId(null);
    liveTryAgainStrikeRef.current = 0;
    setNeedsTapToPlay(false);
    setStalled(false);
    if (timelineHold) {
      setTime(timelineHold.absoluteTimeSec);
      if (timelineHold.durationSec && timelineHold.durationSec > 1) {
        applyVodDurationHint(timelineHold.durationSec);
      } else {
        setDuration(0);
        setVodTotalSec(0);
      }
      vodStartOffsetRef.current = timelineHold.startOffsetSec;
      vodEncodedSecRef.current = 0;
      vodTimelineHoldRef.current = null;
    } else {
      setTime(0);
      setDuration(0);
      setVodTotalSec(0);
      vodDurationHintRef.current = 0;
      vodStartOffsetRef.current = 0;
      vodEncodedSecRef.current = 0;
    }
    setLevels([]);
    setCurrentLevel(-1);
    setSubtitles([]);
    setActiveSubtitle(-1);
    setAudioTracks([]);
    setActiveAudioTrack(-1);
    setLiveAudioNoPicture(false);
    userChoseAutoHlsQualityRef.current = false;
    userTouchedHlsQualityRef.current = false;
    userPickedAudioTrackRef.current = false;

    let cancelled = false;
    fragLoadDowngradeRef.current = 0;
    probeFetchRef.current?.abort();
    probeFetchRef.current = new AbortController();
    const probeSignal = probeFetchRef.current.signal;
    const url = withLiveHlsCompatMse(
      resolveVodPlaybackUrl(vodPlaybackUrl, current.url, {
        containerExt: current.containerExt,
        compatMse: tvBrowser || silkLikeClient,
        kindIsLive: isLive,
      }),
      isLive
    );
    const vodTranscodeHls = !isLive && playbackUrlUsesVodTranscode(url);
    if (!timelineHold && vodTranscodeHls) {
      try {
        const origin =
          typeof window !== "undefined"
            ? window.location.origin
            : "http://localhost";
        const tcSeek = Number(
          new URL(url, origin).searchParams.get("tc_seek") ?? "0"
        );
        // tc_seek is a server hint only. Do not treat it as startOffset — the
        // playlist may be a reused from-0 encode (offset 0) with resume applied
        // after MANIFEST_PARSED / client resume hooks.
        if (Number.isFinite(tcSeek) && tcSeek >= 15) {
          setTime(Math.floor(tcSeek));
        }
      } catch {
        /* noop */
      }
    }
    setLoading(!vodTranscodeHls);

    const preferredVol = readPreferredPlayerVolume();
    if (preferredVol != null) {
      video.volume = preferredVol;
      queueMicrotask(() => setVolume(preferredVol));
    }

    const cleanupHls = () => {
      if (hlsRef.current) {
        destroyHlsInstance(hlsRef.current);
        hlsRef.current = null;
      }
    };

    cleanupHls();
    hlsLiveEdgeRestartGateRef.current = 0;

    const tryAutoplay = async () => {
      if (cancelled) return;
      // Respect an explicit user pause after media is actually playing — but do
      // NOT treat a resume seek (currentTime=40:00 on an empty buffer) as pause.
      // That skipped play() entirely and left prepare stuck until the 28s timeout.
      if (
        video.paused &&
        video.currentTime > 0.25 &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return;
      }
      try {
        await safeVideoPlay(video);
      } catch {
        if (cancelled) return;
        // Autoplay rejected (usually because audio isn't allowed).
        // Try muted autoplay as a fallback.
        try {
          video.muted = true;
          await safeVideoPlay(video);
          // Show a hint so the user can tap to unmute.
          setNeedsTapToPlay(true);
        } catch {
          if (!cancelled) setNeedsTapToPlay(true);
        }
      }
    };

    const isHls = playbackUrlIsHls(url, isLive);

    const canNativeHls =
      typeof video.canPlayType === "function" &&
      video.canPlayType("application/vnd.apple.mpegurl") !== "";
    /**
     * Safari native HLS cannot play our **in-progress** server transcode playlists (growing
     * EVENT-style m3u8). Always use hls.js for `transcode=hls` on Mac Safari, iPhone, etc.
     */
    /**
     * Native WebKit HLS: VOD everywhere it works; **live** only on iPhone/iPad (AC-3 / variant ladders).
     * macOS Safari live uses hls.js so we can hold the live edge (native AVFoundation buffers heavily).
     */
    const useNativeAppleHls =
      isHls &&
      !vodTranscodeHls &&
      ((isLive && isAppleMobileWebKitDevice()) ||
        (!isLive && (canNativeHls || isAppleMobileWebKitDevice())));

    /**
     * iPhone/iPad live: **native** `<video src=m3u8>` (AVFoundation) is the default — it usually handles
     * provider muxed AAC/AC‑3 and variant ladders better than hls.js over **MSE** on WebKit.
     * Set `NEXT_PUBLIC_IOS_LIVE_USE_HLSJS=1` to force hls.js (legacy workaround for some native DVR edge cases).
     */
    const appleMobileLiveMse =
      typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_IOS_LIVE_USE_HLSJS === "1" &&
      isLive &&
      isHls &&
      isAppleMobileWebKitDevice() &&
      (hlsRuntime?.isSupported() ?? false);

    const livingRoomLike =
      typeof navigator !== "undefined" &&
      isTvClassUserAgent(navigator.userAgent || "");

    const silkLike =
      typeof navigator !== "undefined" &&
      isAmazonSilkUserAgent(navigator.userAgent || "");

    /** Do not treat touchscreen laptops as mobile — `pointer: coarse` alone caused huge live buffers + lag. */
    const mobileLike =
      typeof window !== "undefined" &&
      (livingRoomLike ||
        silkLike ||
        window.matchMedia("(max-width: 768px)").matches);

    const mobilePhoneLive =
      isLive && mobileLike && !livingRoomLike && !silkLike && !appleMobileLiveMse;

    const unsupportedBrowserAudioMsg = livingRoomLike || silkLike
      ? "This channel’s audio (often AC-3/E-AC-3) isn’t supported in the Amazon Silk / TV browser player. Try another channel, use Chromecast, or watch with a native IPTV app on the same device if available."
      : isSafariFamilyWithoutChromium() || isAppleMobileWebKitDevice()
        ? "This channel's audio (often AC-3 / E-AC-3) isn't supported in Safari for this feed. Try Chromecast from Chrome or Edge on a computer, your provider's IPTV app, or another channel."
        : "This channel uses audio (often AC-3/EAC-3) that Chromium-based browsers cannot decode in a web player. Try Safari on Mac or iPhone, your provider's native app, or Chromecast.";

    const wantsHlsJs =
      isHls && (!useNativeAppleHls || appleMobileLiveMse);
    if (wantsHlsJs && !hlsRuntime) {
      setLoading(true);
      return () => {
        pauseVideoElement(video);
        cancelled = true;
        if (stallTimer.current) clearTimeout(stallTimer.current);
        const hlsToDestroy = hlsRef.current;
        hlsRef.current = null;
        deferredTeardownCancelRef.current = scheduleDeferredPlayerTeardown(() => {
          deferredTeardownCancelRef.current = null;
          destroyHlsInstance(hlsToDestroy);
          detachVideoElement(video);
        });
      };
    }

    /** VOD only: lightweight availability check before assigning src (live skips). */
    const probeVodThenPlayNative = async (): Promise<boolean> => {
      if (!isLive) {
        const ext = (current.containerExt ?? "").toLowerCase().replace(/^\./, "");
        const likelyMp4 = ext === "mp4" || ext === "m4v";
        try {
          const probe = await fetch(url, {
            method: likelyMp4 ? "HEAD" : "GET",
            ...(likelyMp4
              ? {}
              : { headers: { Range: "bytes=0-0" } }),
            cache: "no-store",
            signal: probeSignal,
          });
          if (cancelled) return false;
          const rid = probe.headers.get(STREAM_PROXY_REQUEST_ID_HEADER);
          if (rid) {
            streamSupportRequestIdRef.current = rid;
            setStreamSupportRequestId(rid);
          }
          if (probe.status === 404 || probe.status === 410) {
            setError("This episode isn't available from your provider.");
            setLoading(false);
            return false;
          }
          if (probe.status === 403) {
            setError(
              "Your provider blocked this request. Try another episode or try again later."
            );
            setLoading(false);
            return false;
          }
          /* Other 4xx (e.g. provider 400 on wrong extension) — let the player try. */
        } catch (e) {
          if (cancelled || (e instanceof DOMException && e.name === "AbortError"))
            return false;
          /* fall through — let <video> try */
        }
      }
      if (cancelled) return false;
      video.src = url;
      void tryAutoplay();
      return true;
    };

    // Native WebKit: VOD + Apple live fallback when MSE/hls.js isn’t available (older iOS, unsupported codecs).
    // Apple mobile **live** + MSE: use hls.js — smoother IPTV experience than native `<video>` alone.
    if (useNativeAppleHls && !appleMobileLiveMse) {
      void probeVodThenPlayNative();
    } else if (
      isHls &&
      hlsRuntime &&
      hlsRuntime.isSupported() &&
      (!isAppleMobileWebKitDevice() || isLive || vodTranscodeHls)
    ) {
      const Hls = hlsRuntime;
      const isLikelyUnsupportedAudioCodecError = (data: ErrorData): boolean => {
        const d = data.details;
        if (
          d === Hls.ErrorDetails.BUFFER_ADD_CODEC_ERROR ||
          d === Hls.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR ||
          d === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR
        ) {
          return true;
        }
        if (
          d === Hls.ErrorDetails.BUFFER_APPEND_ERROR &&
          data.sourceBufferName === "audio"
        ) {
          const idx = hlsRef.current?.currentLevel ?? -1;
          const lv =
            idx >= 0 && hlsRef.current?.levels
              ? hlsRef.current.levels[idx]
              : undefined;
          return !!lv && levelDeclaresNonPreferredChromePackagedAudio(lv);
        }
        return false;
      };
      let mediaRecoverAttempts = 0;
      let audioCodecFallbackTried = false;
      let swapAudioCodecTried = false;
      let audioAppendRecoveryAttempts = 0;

      const chromiumLiveQualityLockEligible =
        isLive &&
        !livingRoomLike &&
        !silkLike &&
        !appleMobileLiveMse &&
        !mobileLike &&
        isChromiumBasedDesktopBrowser();

      const tvLiveQualityLockEligible =
        isLive && (livingRoomLike || silkLike) && !appleMobileLiveMse;

      const mobileLiveQualityLockEligible = mobilePhoneLive;

      const liveManifestStabilizeLocked =
        chromiumLiveQualityLockEligible ||
        tvLiveQualityLockEligible ||
        mobileLiveQualityLockEligible;

      /**
       * Live playlists refresh and ABR climbs — re-apply filters so we don't drift into HEVC/Dolby variants Chromium can't decode over MSE.
       * Desktop Chromium: pin lowest-safe **once on MANIFEST_PARSED only** — repeating `currentLevel=` on every `MANIFEST_LOADED`/recovery thrashed MSE and produced bogus codec errors.
       */
      const recoveryGenAtStart = livePlaybackRecoveryGenRef.current;
      let livePlaybackHealthy = false;
      let liveSoftRecoverBeforeError = false;
      let lastManifestStabilizeMs = 0;

      const attemptLiveSoftRecover = (): boolean => {
        const el = videoRef.current;
        if (cancelled || !el) return false;
        try {
          livePlaybackErrorSuppressUntilRef.current =
            performance.now() + 10_000;
          applyGentleLiveHlsRecovery(hls, el);
          return true;
        } catch {
          return false;
        }
      };

      /** Live: keep hls.js for Try again (soft reload). Tear down only for VOD or channel change. */
      const surfacePlaybackError = (message: string) => {
        if (cancelled || recoveryGenAtStart !== livePlaybackRecoveryGenRef.current) {
          return;
        }
        if (
          isLive &&
          performance.now() < livePlaybackErrorSuppressUntilRef.current
        ) {
          return;
        }
        setStalled(false);
        setLoading(false);
        setError(message);
        playbackBreadcrumb("playback_error", {
          live: isLive,
          requestId: streamSupportRequestIdRef.current ?? undefined,
          channelId: current?.id,
        });
        const activeHls = hlsRef.current;
        if (activeHls) {
          try {
            activeHls.stopLoad();
          } catch {
            /* noop */
          }
        }
        if (!isLive) {
          cleanupHls();
        }
        /** Live: keep the hls.js instance for Try again (soft reload); stopLoad halts retry storms. */
      };

      const runStabilizeBrowserFriendlyCodecs = () => {
        if (cancelled) return;
        stabilizeBrowserFriendlyCodecs(hls, {
          isLive,
          livingRoomLike,
          silkLike,
          appleMobileLiveMse,
          mobilePhoneLive,
        });
      };

      const levelsReactKeyRef = { current: "" };

      const publishLevels = (lvls: Level[]) => {
        const key = levelsListKey(lvls);
        if (key === levelsReactKeyRef.current) return;
        levelsReactKeyRef.current = key;
        setLevels([...lvls]);
      };

      const baseHlsConfig = appleMobileLiveMse
        ? buildAppleMobileLiveHlsConfig()
        : buildIptvHlsJsConfig({
            isLive,
            mobileLike,
            livingRoomLike,
            silkLike,
            chromiumDesktop: chromiumDesktopClient,
          });
      const hlsConfig = {
        ...baseHlsConfig,
        ...(vodTranscodeHls ? buildVodTranscodeHlsJsConfig() : {}),
        // Hard startPosition:0 fights mid-film resume on EVENT playlists.
        ...(vodTranscodeHls &&
        pendingAbsoluteSeekSec != null &&
        pendingAbsoluteSeekSec >= 15
          ? {
              startPosition: Math.max(
                0,
                pendingAbsoluteSeekSec -
                  Math.max(0, timelineHold?.startOffsetSec ?? 0)
              ),
            }
          : {}),
        xhrSetup(xhr: XMLHttpRequest, reqUrl: string) {
          if (!reqUrl.includes("/api/stream")) return;
          xhr.addEventListener("load", function onLoad() {
            xhr.removeEventListener("load", onLoad);
            if (cancelled) return;
            const rid = xhr.getResponseHeader(STREAM_PROXY_REQUEST_ID_HEADER);
            if (rid) {
            streamSupportRequestIdRef.current = rid;
            setStreamSupportRequestId(rid);
          }
            if (
              vodTranscodeHls &&
              !reqUrl.includes("media=") &&
              xhr.status >= 400
            ) {
              const raw = xhr.responseText?.trim();
              const body = humanizePlaybackErrorResponse(
                raw,
                "Could not prepare this file for browser playback. If your IPTV plan allows only one stream, close other players and try again.",
                xhr.status
              );
              const vv = videoRef.current;
              const midPlayback =
                !!vv &&
                (vv.currentTime > 0.5 ||
                  vv.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
              // 503 = still encoding. Mid-play 502 is often a brief overload /
              // provider blip — hard-failing here kills an episode at ~10m.
              if (xhr.status === 503 || (midPlayback && xhr.status === 502)) {
                const srcPctHdr = xhr.getResponseHeader("x-vod-source-pct");
                const srcPct = srcPctHdr ? parseFloat(srcPctHdr) : NaN;
                if (Number.isFinite(srcPct) && srcPct > 0) {
                  const mapped = Math.min(88, Math.round(8 + srcPct * 0.7));
                  setVodPrepProgress((p) => Math.max(p, mapped));
                } else {
                  setVodPrepProgress((p) => Math.min(92, Math.max(p, 20) + 3));
                }
                return;
              }
              surfacePlaybackError(body);
              return;
            }
            if (vodTranscodeHls && !reqUrl.includes("media=")) {
              setVodPrepProgress((p) => Math.max(p, 34));
            }
            if (!vodTranscodeHls) return;
            const srcPctHdr = xhr.getResponseHeader("x-vod-source-pct");
            const srcPct = srcPctHdr ? parseFloat(srcPctHdr) : NaN;
            if (Number.isFinite(srcPct) && srcPct > 0) {
              // Map download progress into the lower prep band so "Preparing…" moves.
              const mapped = Math.min(88, Math.round(8 + srcPct * 0.7));
              setVodPrepProgress((p) => Math.max(p, mapped));
            }
            const offHdr = xhr.getResponseHeader("x-vod-start-offset-sec");
            const encHdr = xhr.getResponseHeader("x-vod-encoded-sec");
            const off = offHdr ? parseFloat(offHdr) : NaN;
            const enc = encHdr ? parseFloat(encHdr) : NaN;
            // Apply timeline hints before duration so resume can see encodedSec
            // when durationchange fires from applyVodDurationHint.
            applyVodTranscodeTimelineHints({
              startOffset: Number.isFinite(off) && off >= 0 ? off : undefined,
              encoded: Number.isFinite(enc) && enc > 0 ? enc : undefined,
            });
            const durHdr = xhr.getResponseHeader("x-vod-duration-sec");
            const hint = durHdr ? parseFloat(durHdr) : NaN;
            if (Number.isFinite(hint) && hint > 1) {
              applyVodDurationHint(hint);
            }
            if (Number.isFinite(enc) && enc > 2) {
              setVodPrepProgress((p) => Math.max(p, 90));
            }
          });
        },
      };
      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);

      /** Fatal `NETWORK_ERROR` streak — reset whenever data actually flows (Safari otherwise accumulates transient fatals). */
      let consecutiveNetworkErrors = 0;
      let transcodeManifestSoftRetries = 0;
      /** Debounce `startLoad` on VOD-transcode frag errors — storming it races the encode edge. */
      let lastTranscodeFragRestartAt = 0;
      const resetNetErrStreak = () => {
        consecutiveNetworkErrors = 0;
        transcodeManifestSoftRetries = 0;
      };

      /** Intentionally no periodic `startLoad(-1)` — it fights hls.js live playlist refresh and causes visible black/rebuffer loops on many panels. */

      /** Growing EVENT transcode playlists re-fire MANIFEST_PARSED — never restart at 0 mid-play. */
      let transcodeManifestBootstrapped = false;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        resetNetErrStreak();
        publishLevels(hls.levels);
        if (vodTranscodeHls) {
          setVodPrepProgress((p) => Math.max(p, 48));
          setCurrentLevel(-1);
          if (!transcodeManifestBootstrapped) {
            transcodeManifestBootstrapped = true;
            const off = Math.max(0, vodStartOffsetRef.current);
            const absolute =
              pendingAbsoluteSeekSec != null &&
              Number.isFinite(pendingAbsoluteSeekSec)
                ? pendingAbsoluteSeekSec
                : null;
            const rel =
              absolute != null ? Math.max(0, absolute - off) : 0;
            try {
              hls.startLoad(rel);
            } catch {
              /* noop */
            }
            if (rel > 0.5) {
              try {
                video.currentTime = rel;
              } catch {
                /* noop */
              }
            }
            void tryAutoplay();
            // Keep resume unlocked until the playhead is near the target so
            // use-player-vod-resume can retry if the first seek is clamped.
            if (
              absolute != null &&
              absolute >= 15 &&
              vodResumeLockedRef &&
              Math.abs((video.currentTime || 0) + off - absolute) < 20
            ) {
              vodResumeLockedRef.current = true;
            }
          }
          return;
        }
        runStabilizeBrowserFriendlyCodecs();
        if (chromiumLiveQualityLockEligible || mobileLiveQualityLockEligible) {
          const startIdx = indexOfLowestSafeLevel(hls.levels);
          if (startIdx >= 0) {
            try {
              hls.startLevel = startIdx;
              hls.autoLevelCapping = startIdx;
            } catch {
              /* noop */
            }
          }
        }
        livePlaybackErrorSuppressUntilRef.current =
          performance.now() + LIVE_PLAYBACK_ERROR_GRACE_MS;
        setCurrentLevel(-1);
        // Pull subtitle tracks from HLS manifest
        const subs = hls.subtitleTracks as MediaPlaylist[] | undefined;
        if (subs && subs.length) {
          setSubtitles(
            subs.map((t, i) => ({
              id: i,
              label: t.name || t.lang || `Track ${i + 1}`,
              lang: t.lang,
              source: "hls" as const,
            }))
          );
          hls.subtitleTrack = -1;
        }
        void tryAutoplay();
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
        if (cancelled) return;
        const subs = data.subtitleTracks || [];
        setSubtitles(
          subs.map((t, i) => ({
            id: i,
            label: t.name || t.lang || `Track ${i + 1}`,
            lang: t.lang,
            source: "hls" as const,
          }))
        );
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        if (cancelled) return;
        const tracks = hls.audioTracks ?? [];
        setAudioTracks(mapHlsAudioTracks(tracks));
        if (!userPickedAudioTrackRef.current) {
          preferBrowserFriendlyAudioTrack(hls);
        }
        setActiveAudioTrack(hls.audioTrack);
      });

      /**
       * Live playlists refresh every few seconds. Re-strip codec rungs (no quality re-pin)
       * so ABR can't drift into Dolby/HEVC variants that weren't in the first manifest.
       */
      hls.on(Hls.Events.MANIFEST_LOADED, () => {
        if (cancelled) return;
        resetNetErrStreak();
        if (isLive && !liveManifestStabilizeLocked) {
          const now = performance.now();
          if (now - lastManifestStabilizeMs >= 8000) {
            lastManifestStabilizeMs = now;
            runStabilizeBrowserFriendlyCodecs();
          }
        }
      });

      hls.on(Hls.Events.LEVELS_UPDATED, () => {
        if (cancelled || !isLive) return;
        publishLevels(hls.levels);
        /** Re-filtering codec rungs on every playlist tick changes ABR mid-play → visible time jumps. */
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
        if (cancelled) return;
        setActiveAudioTrack(hls.audioTrack);
        if (!userPickedAudioTrackRef.current) {
          preferBrowserFriendlyAudioTrack(hls);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (cancelled) return;
        const next = hls.autoLevelEnabled ? -1 : data.level;
        setCurrentLevel((prev) => (prev === next ? prev : next));
        const idx = data.level;
        const lv = hls.levels[idx];
        if (!lv || cancelled) return;
        if (
          levelDeclaresHevc(lv) ||
          levelDeclaresNonPreferredChromePackagedAudio(lv)
        ) {
          const safeIdx = indexOfLowestSafeLevel(hls.levels);
          if (
            safeIdx >= 0 &&
            safeIdx !== idx &&
            !levelDeclaresHevc(hls.levels[safeIdx]) &&
            !levelDeclaresNonPreferredChromePackagedAudio(hls.levels[safeIdx])
          ) {
            try {
              hls.autoLevelCapping = safeIdx;
              /**
               * Forcing `currentLevel` after playback started thrashes MSE and surfaces
               * `<video error>` ~1s in — cap ABR and only hard-switch before first buffer.
               */
              if (!livePlaybackHealthy) {
                hls.currentLevel = safeIdx;
              }
            } catch {
              /* noop */
            }
          }
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, resetNetErrStreak);
      hls.on(Hls.Events.LEVEL_LOADED, resetNetErrStreak);

      if (isLive) {
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (cancelled) return;
          livePlaybackHealthy = true;
          livePlaybackErrorSuppressUntilRef.current =
            performance.now() + LIVE_PLAYBACK_ERROR_GRACE_MS;
          setError(null);
          setStalled(false);
          setLoading(false);
        });
      }

      const markTranscodePlaybackStarted = () => {
        if (cancelled) return;
        setVodPrepProgress((p) => Math.max(p, 88));
        setVideoHasFrame(true);
        setLoading(false);
        setStalled(false);
      };

      if (vodTranscodeHls) {
        hls.on(Hls.Events.FRAG_LOADED, () => {
          if (cancelled) return;
          // Do not invent encoded coverage from currentTime — tip-only playlists
          // can report a high playhead while earlier segments are missing from
          // the published playlist. Trust x-vod-encoded-sec from the server.
          setVodPrepProgress((p) => Math.max(p, 72));
          markTranscodePlaybackStarted();
        });
        hls.on(Hls.Events.FRAG_BUFFERED, markTranscodePlaybackStarted);
        hls.on(Hls.Events.BUFFER_APPENDED, () => {
          if (cancelled) return;
          const vv = videoRef.current;
          if (vv && vv.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            markTranscodePlaybackStarted();
          }
        });
      }

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) {
          // BUFFER_APPEND_ERROR fires in tight loops on bad audio tracks — recover once before fatal MEDIA_ERROR.
          if (data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR) {
            const audioBuf =
              data.sourceBufferName === "audio" ||
              data.sourceBufferName === "audiovideo";
            // Never call full stabilize here — stripping levels + re-pinning quality mid-playback caused transient MEDIA_ERROR; Try again only ran startLoad().
            if (isLive && audioBuf && audioAppendRecoveryAttempts < 4) {
              audioAppendRecoveryAttempts += 1;
              preferBrowserFriendlyAudioTrack(hls);
              const tracks = hls.audioTracks;
              const cur = hls.audioTrack;
              if (tracks.length > 1 && cur >= 0) {
                for (let i = 0; i < tracks.length; i++) {
                  if (i === cur) continue;
                  try {
                    hls.audioTrack = i;
                    break;
                  } catch {
                    /* try next */
                  }
                }
              }
              if (audioAppendRecoveryAttempts >= 2) {
                tryCapAbrLower(hls);
                runStabilizeBrowserFriendlyCodecs();
              }
              try {
                hls.recoverMediaError();
              } catch {
                /* noop */
              }
            }
            return;
          }
          // Repeated frag/level transport errors → step ABR down (live + VOD).
          const bumpDetails = [
            Hls.ErrorDetails.BUFFER_FULL_ERROR,
            Hls.ErrorDetails.FRAG_LOAD_ERROR,
            Hls.ErrorDetails.FRAG_LOAD_TIMEOUT,
            Hls.ErrorDetails.LEVEL_LOAD_ERROR,
            Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT,
          ];
          const fragish = bumpDetails.includes(data.details);
          if (fragish) {
            fragLoadDowngradeRef.current += 1;
            if (fragLoadDowngradeRef.current >= 6) {
              fragLoadDowngradeRef.current = 0;
              tryCapAbrLower(hls);
            }
          }
          // Live: let hls.js retry fragments — edge `startLoad(-1)` on every frag error causes pause/freeze loops.
          if (!isLive && fragish) {
            const vv = videoRef.current;
            if (vv?.paused) return;
            // Intentional scrub in flight — tip startLoad fights land verification.
            if (vodTranscodeHls && vodScrubbingRef?.current) return;
            if (vodTranscodeHls) {
              const httpCode =
                typeof data.response?.code === "number"
                  ? data.response.code
                  : 0;
              // 503 = segment still encoding — hls.js retries; restarting load jumps buffer holes.
              if (
                httpCode === 503 ||
                data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT
              ) {
                return;
              }
              const now = performance.now();
              if (now - lastTranscodeFragRestartAt < 3_000) return;
              lastTranscodeFragRestartAt = now;
            }
            try {
              const pos =
                vodTranscodeHls && vv && Number.isFinite(vv.currentTime)
                  ? Math.max(0, vv.currentTime)
                  : -1;
              hls.startLoad(pos);
            } catch {
              /* noop */
            }
          }
          if (process.env.NODE_ENV !== "production") {
            console.warn("[hls] error", data.type, data.details, data);
          }
          return;
        }

        if (process.env.NODE_ENV !== "production") {
          console.warn("[hls] fatal", data.type, data.details, data);
        }

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR: {
            const softManifestReload =
              vodTranscodeHls &&
              [
                Hls.ErrorDetails.MANIFEST_LOAD_ERROR,
                Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT,
                Hls.ErrorDetails.LEVEL_LOAD_ERROR,
                Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT,
              ].includes(data.details);
            if (softManifestReload) {
              transcodeManifestSoftRetries += 1;
              if (transcodeManifestSoftRetries >= 8) {
                void fetch(url, { credentials: "same-origin", cache: "no-store" })
                  .then(async (res) => {
                    const raw = (await res.text()).trim();
                    surfacePlaybackError(
                      humanizePlaybackErrorResponse(
                        raw,
                        "Could not prepare transcoded playback. If your IPTV plan allows only one stream, close other players and try again.",
                        res.status
                      )
                    );
                  })
                  .catch(() => {
                    surfacePlaybackError(
                      "Could not prepare transcoded playback. Tap Try again — or use a native IPTV app for MKV files."
                    );
                  });
                break;
              }
              try {
                const vv = videoRef.current;
                const pos =
                  vv && Number.isFinite(vv.currentTime)
                    ? Math.max(0, vv.currentTime)
                    : 0;
                hls.startLoad(pos);
              } catch {
                /* noop */
              }
              break;
            }
            consecutiveNetworkErrors += 1;
            {
              const touchyClient =
                mobileLike || isAppleMobileWebKitDevice();
              const maxFatalNet = vodTranscodeHls
                ? 28
                : touchyClient
                  ? isLive
                    ? 22
                    : 14
                  : isLive
                    ? 7
                    : 8;
              if (consecutiveNetworkErrors >= maxFatalNet) {
                if (
                  isLive &&
                  !liveSoftRecoverBeforeError &&
                  attemptLiveSoftRecover()
                ) {
                  liveSoftRecoverBeforeError = true;
                  break;
                }
                surfacePlaybackError(
                  vodTranscodeHls
                    ? "Transcoded playback failed. Tap Try again to restart encoding — or use a native IPTV app for MKV files."
                    : "Couldn't reach this stream. The channel may be offline or your provider blocked the request."
                );
              } else {
                try {
                  const vv = videoRef.current;
                  const pos =
                    vodTranscodeHls && vv && Number.isFinite(vv.currentTime)
                      ? Math.max(0, vv.currentTime)
                      : -1;
                  hls.startLoad(pos);
                } catch {
                  hls.startLoad();
                }
              }
            }
            break;
          }
          case Hls.ErrorTypes.MEDIA_ERROR:
            if (isLikelyUnsupportedAudioCodecError(data)) {
              const tracks = hls.audioTracks;
              const cur = hls.audioTrack;
              if (!audioCodecFallbackTried && tracks.length > 1 && cur >= 0) {
                audioCodecFallbackTried = true;
                let switched = false;
                for (let i = 0; i < tracks.length; i++) {
                  if (i === cur) continue;
                  try {
                    hls.audioTrack = i;
                    hls.recoverMediaError();
                    switched = true;
                    break;
                  } catch {
                    /* try next alternate */
                  }
                }
                if (switched) break;
              }
              if (!swapAudioCodecTried) {
                swapAudioCodecTried = true;
                try {
                  hls.swapAudioCodec();
                  hls.recoverMediaError();
                  break;
                } catch {
                  /* fall through */
                }
              }
              if (
                isLive &&
                !liveSoftRecoverBeforeError &&
                attemptLiveSoftRecover()
              ) {
                liveSoftRecoverBeforeError = true;
                break;
              }
              // Single-track AC-3/DTS (etc.): track switch / swapAudioCodec can't help —
              // upgrade progressive/proxy VOD to server HLS (copyVideo → AAC) before giving up.
              if (!isLive && requestVodTranscodeFallbackRef.current()) {
                break;
              }
              surfacePlaybackError(
                isLive
                  ? livePlaybackStoppedMessage(livePlaybackHealthy)
                  : unsupportedBrowserAudioMsg
              );
              break;
            }
            if (mediaRecoverAttempts >= (isLive ? 10 : 2)) {
              if (
                isLive &&
                !liveSoftRecoverBeforeError &&
                attemptLiveSoftRecover()
              ) {
                liveSoftRecoverBeforeError = true;
                break;
              }
              surfacePlaybackError(
                isLive
                  ? livePlaybackStoppedMessage(livePlaybackHealthy)
                  : "Playback failed after repeated media errors. This stream may use unsupported audio/video in your browser."
              );
              break;
            }
            mediaRecoverAttempts += 1;
            try {
              hls.recoverMediaError();
            } catch {
              surfacePlaybackError(
                "Media error: this stream isn't playable in the browser."
              );
            }
            break;
          default:
            surfacePlaybackError("Playback failed. Try a different channel.");
        }
      });
    } else if (!isHls) {
      // Direct progressive file (mp4/mkv via proxy) — same VOD probe as native HLS path.
      void probeVodThenPlayNative();
    } else {
      queueMicrotask(() =>
        setError("Your browser cannot play this stream.")
      );
    }

    // Stall watchdog: if almost nothing has buffered after a timeout, surface a hint.
    // Live copy suggests provider issues; VOD often means unsupported codec/container on mobile.
    if (stallTimer.current) clearTimeout(stallTimer.current);
    const vodProgressivePlayback =
      !isLive && !playbackUrlIsHls(url, isLive);
    const stallMs = vodTranscodeHls
      ? 50_000
      : vodProgressivePlayback
        ? 26_000
        : isLive && chromiumDesktopClient
          ? 28_000
          : isLive && livingRoomLike
            ? 32_000
            : silkLike
              ? 18_000
              : isLive
                ? 20_000
                : 12_000;

    let liveStallRecoveryTried = false;

    const runStallWatchdog = () => {
      if (cancelled) return;
      const v = videoRef.current;
      if (!v) return;
      let bufferedEnd = 0;
      for (let bi = 0; bi < v.buffered.length; bi++) {
        bufferedEnd = Math.max(bufferedEnd, v.buffered.end(bi));
      }
      const hasBuffer = bufferedEnd > 0.35;
      if (hasBuffer || v.error) {
        setStalled(false);
        return;
      }
      if (
        vodProgressivePlayback &&
        requestVodTranscodeFallbackRef.current()
      ) {
        return;
      }
      if (isLive) {
        const suppressRemaining =
          livePlaybackErrorSuppressUntilRef.current - performance.now();
        if (suppressRemaining > 0) {
          stallTimer.current = setTimeout(
            runStallWatchdog,
            suppressRemaining + 400
          );
          return;
        }
        const hls = hlsRef.current;
        if (!liveStallRecoveryTried && hls) {
          liveStallRecoveryTried = true;
          try {
            applyGentleLiveHlsRecovery(hls, v);
          } catch {
            /* noop */
          }
          stallTimer.current = setTimeout(runStallWatchdog, 5_000);
          return;
        }
      }
      setStalled(true);
    };

    stallTimer.current = setTimeout(runStallWatchdog, stallMs);

    return () => {
      pauseVideoElement(video);
      cancelled = true;
      probeFetchRef.current?.abort();
      vodPrepKickRef.current?.abort();
      vodPrepKickRef.current = null;
      if (vodSeekRestartTimerRef.current) {
        clearTimeout(vodSeekRestartTimerRef.current);
        vodSeekRestartTimerRef.current = null;
      }
      if (stallTimer.current) clearTimeout(stallTimer.current);

      const hlsToDestroy = hlsRef.current;
      hlsRef.current = null;
      deferredTeardownCancelRef.current = scheduleDeferredPlayerTeardown(() => {
        deferredTeardownCancelRef.current = null;
        if (video && creds && current && current.kind !== "live") {
          // Closing mid-scrub / right after a failed land must not re-bookmark the tip.
          const skipTipPersist =
            !!vodScrubbingRef?.current ||
            shouldSuppressVodTipPersist(
              Date.now(),
              vodSeekSuppressTipPersistUntilRef?.current ?? 0
            );
          if (!skipTipPersist) {
            const key = vodResumeStorageKey(browseAccountKey(creds), current);
            const activeUrl = vodPlaybackUrl ?? current.url;
            const usesTranscode = playbackUrlUsesVodTranscode(activeUrl);
            const absolute = vodAbsoluteSec(video.currentTime, {
              usesTranscode,
              startOffsetSec: vodStartOffsetRef.current,
            });
            const d =
              vodDurationHintRef.current > 1
                ? vodDurationHintRef.current
                : video.duration;
            if (
              key &&
              d &&
              Number.isFinite(d) &&
              shouldPersistVodResume(absolute, d)
            ) {
              usePrefs.getState().saveVodResume(key, absolute);
            }
          }
        }
        destroyHlsInstance(hlsToDestroy);
        if (vodTranscodeHls) {
          releaseVodTranscodePlayback(url);
        }
        detachVideoElement(video);
      });
    };
  }, [
    open,
    current,
    isLive,
    creds,
    vodPlaybackUrl,
    applyVodDurationHint,
    applyVodTranscodeTimelineHints,
    vodTimelineHoldRef,
    vodResumeLockedRef,
    vodScrubbingRef,
    playbackRetryKey,
    chromiumDesktopClient,
    tvBrowser,
    silkLikeClient,
    hlsRuntime,
    videoRef,
    hlsRef,
    streamSupportRequestIdRef,
    liveTryAgainStrikeRef,
    fragLoadDowngradeRef,
    probeFetchRef,
    vodDurationHintRef,
    vodStartOffsetRef,
    vodEncodedSecRef,
    hlsLiveEdgeRestartGateRef,
    livePlaybackRecoveryGenRef,
    livePlaybackErrorSuppressUntilRef,
    userChoseAutoHlsQualityRef,
    userTouchedHlsQualityRef,
    userPickedAudioTrackRef,
    vodPrepKickRef,
    vodSeekRestartTimerRef,
    stallTimer,
    deferredTeardownCancelRef,
    requestVodTranscodeFallbackRef,
    setError,
    setStreamSupportRequestId,
    setNeedsTapToPlay,
    setStalled,
    setTime,
    setDuration,
    setVodTotalSec,
    setLevels,
    setCurrentLevel,
    setSubtitles,
    setActiveSubtitle,
    setAudioTracks,
    setActiveAudioTrack,
    setLiveAudioNoPicture,
    setLoading,
    setVolume,
    setVideoHasFrame,
    setVodPrepProgress,
  ]);
}
