"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type Hls from "hls.js";
import { isAppleMobileWebKitDevice } from "@/lib/browser";
import {
  applyGentleLiveHlsRecovery,
  applySoftLiveHlsRecovery,
  LIVE_PLAYBACK_ERROR_GRACE_MS,
  LIVE_VIDEO_ERROR_DEFER_MS,
  liveCodecUserMessage,
} from "@/lib/live-hls-playback";
import { playbackUrlIsHls } from "@/lib/playback-url";
import { withLiveHlsCompatMse } from "@/lib/stream-url";
import { voidSafeVideoPlay } from "@/lib/video-play";
import { writePreferredPlayerVolume } from "@/lib/player-volume-pref";
import { videoLikelyMissingDecodableAudio } from "@/lib/vod-silent-audio";
import {
  isVodTranscodeEnabledClient,
} from "@/lib/vod-transcode-url";
import type { PlayerSource } from "@/store/player";
import {
  shouldTreatTranscodeAsEnded,
  shouldTreatTranscodeSnapAsEnded,
  signalTranscodePlaybackEnded,
} from "@/lib/player-transcode-playback-end";

function isBraveOnAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!isAppleMobileWebKitDevice()) return false;
  return /\bBrave\b/i.test(navigator.userAgent || "");
}

export type UsePlayerVideoEventsParams = {
  open: boolean;
  current: PlayerSource | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  hlsRef: RefObject<InstanceType<typeof Hls> | null>;
  hlsLiveEdgeRestartGateRef: RefObject<number>;
  usesTranscodePlayback: boolean;
  vodTotalSec: number;
  vodDurationHintRef: RefObject<number>;
  vodStartOffsetRef: RefObject<number>;
  vodEncodedSecRef: RefObject<number>;
  vodScrubbingRef: RefObject<boolean>;
  mobileLikeViewport: boolean;
  chromiumDesktopClient: boolean;
  cancelLiveMediaErrorDeferRef: RefObject<() => void>;
  livePlaybackErrorSuppressUntilRef: RefObject<number>;
  requestVodTranscodeFallbackRef: RefObject<() => boolean>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setNeedsTapToPlay: Dispatch<SetStateAction<boolean>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setStalled: Dispatch<SetStateAction<boolean>>;
  setTime: Dispatch<SetStateAction<number>>;
  setBuffered: Dispatch<SetStateAction<number>>;
  setMuted: Dispatch<SetStateAction<boolean>>;
  setVolume: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLiveAudioNoPicture: Dispatch<SetStateAction<boolean>>;
  setVideoHasFrame: Dispatch<SetStateAction<boolean>>;
  setVodPrepProgress: Dispatch<SetStateAction<number>>;
  setIsPip: Dispatch<SetStateAction<boolean>>;
  applyVodDurationHint: (sec: number) => void;
};

export function usePlayerVideoEvents(p: UsePlayerVideoEventsParams) {
  const {
    open,
    current,
    videoRef,
    hlsRef,
    hlsLiveEdgeRestartGateRef,
    usesTranscodePlayback,
    vodTotalSec,
    vodDurationHintRef,
    vodStartOffsetRef,
    vodEncodedSecRef,
    vodScrubbingRef,
    mobileLikeViewport,
    chromiumDesktopClient,
    cancelLiveMediaErrorDeferRef,
    livePlaybackErrorSuppressUntilRef,
    requestVodTranscodeFallbackRef,
    setIsPlaying,
    setNeedsTapToPlay,
    setLoading,
    setStalled,
    setTime,
    setBuffered,
    setMuted,
    setVolume,
    setError,
    setLiveAudioNoPicture,
    setVideoHasFrame,
    setVodPrepProgress,
    setIsPip,
    applyVodDurationHint,
  } = p;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let volPersistTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePersistPreferredVolume = (vol: number) => {
      if (volPersistTimer) clearTimeout(volPersistTimer);
      volPersistTimer = setTimeout(() => {
        volPersistTimer = null;
        writePreferredPlayerVolume(vol);
      }, 400);
    };

    const isLiveStream = current?.kind === "live";
    let liveKickTimer: ReturnType<typeof setTimeout> | null = null;
    /** `window.setTimeout` id — avoids DOM vs `@types/node` Timeout mismatch. */
    let liveMediaErrorDeferTimer: number | null = null;
    const liveProgress = { lastCt: -1, stuckSince: 0 };
    let lastLowBufferKick = 0;
    let nativeStallKicks = 0;
    /** Throttle React state from `timeupdate` — frequent setState competes with video decode on WebKit. */
    let lastUiFlushMs = 0;
    let lastMarkPictureMs = 0;
    /** Sustained audio-without-picture — auto-reload before surfacing the banner. */
    let liveNoPictureSince = 0;
    /** Progressive VOD: one-shot silent-audio → server transcode upgrade. */
    let vodSilentAudioResolved = false;
    let liveNoPictureRecoveries = 0;
    let lastNoPictureRecoveryMs = 0;
    let maxTranscodeRelSeen = 0;
    let transcodeEndedSignaled = false;

    const cancelLiveKickTimer = () => {
      if (liveKickTimer) {
        clearTimeout(liveKickTimer);
        liveKickTimer = null;
      }
    };

    const cancelLiveMediaErrorDefer = () => {
      if (liveMediaErrorDeferTimer) {
        clearTimeout(liveMediaErrorDeferTimer);
        liveMediaErrorDeferTimer = null;
      }
    };
    cancelLiveMediaErrorDeferRef.current = cancelLiveMediaErrorDefer;

    /** Chromium (hls.js): restart loading. Safari/WebKit (native HLS): nudge toward live edge — was missing before. */
    const kickLivePlayback = () => {
      const vv = videoRef.current;
      if (!vv || vv.paused || vv.error) return;
      const hls = hlsRef.current;
      if (hls) {
        try {
          applyGentleLiveHlsRecovery(hls, vv);
        } catch {
          try {
            hls.recoverMediaError();
          } catch {
            /* noop */
          }
          voidSafeVideoPlay(vv);
        }
        return;
      }
      /**
       * Native `<video>` HLS (mostly iPhone/iPad): manual seeks toward “live edge” or inside the
       * buffer fight AVFoundation’s sliding IPTV window — users see forward/backward jumps.
       * Let the demuxer catch up; only nudge `play()`. Full reload stays a last resort below.
       */
      voidSafeVideoPlay(vv);
    };

    const reloadNativeLiveSource = () => {
      const vv = videoRef.current;
      const url =
        current?.url && current.kind === "live"
          ? withLiveHlsCompatMse(current.url, true)
          : current?.url;
      if (!vv || !url || current?.kind !== "live") return;
      try {
        vv.pause();
        vv.removeAttribute("src");
        vv.load();
        vv.src = url;
        voidSafeVideoPlay(vv);
      } catch {
        /* noop */
      }
    };

    const recoverLiveNoPicture = () => {
      const vv = videoRef.current;
      if (!vv || vv.paused || current?.kind !== "live") return;
      const hls = hlsRef.current;
      if (hls) {
        try {
          if (liveNoPictureRecoveries >= 2) {
            applySoftLiveHlsRecovery(hls, vv, hlsLiveEdgeRestartGateRef);
          } else {
            applyGentleLiveHlsRecovery(hls, vv);
          }
        } catch {
          voidSafeVideoPlay(vv);
        }
        return;
      }
      reloadNativeLiveSource();
    };

    const kickLiveIfBufferLow = () => {
      const vv = videoRef.current;
      if (!vv) return;
      const ahead =
        vv.buffered.length > 0
          ? vv.buffered.end(vv.buffered.length - 1) - vv.currentTime
          : 0;
      /** hls.js manages its own live edge — native-only nudge when buffer is critically low. */
      const threshold = hlsRef.current ? 0 : 4.5;
      if (!hlsRef.current && ahead < threshold) kickLivePlayback();
    };

    const stripPosterForWebKit = () => {
      try {
        v.removeAttribute("poster");
      } catch {
        /* noop */
      }
    };

    const markPictureReady = () => {
      const hasDimensions = v.videoWidth > 0 && v.videoHeight > 0;
      const hasDecodedFrame =
        usesTranscodePlayback &&
        !v.error &&
        v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        (hasDimensions || v.currentTime > 0.02);
      if (hasDimensions || hasDecodedFrame) {
        setVideoHasFrame(true);
        setLoading(false);
        setStalled(false);
        if (usesTranscodePlayback) setVodPrepProgress(100);
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      if (!usesTranscodePlayback) setLoading(false);
      else markPictureReady();
      setNeedsTapToPlay(false);
      if (!usesTranscodePlayback) setStalled(false);
      stripPosterForWebKit();
      if (v.videoWidth > 0) setLiveAudioNoPicture(false);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => {
      if (!isLiveStream && usesTranscodePlayback) return;
      setLoading(true);
      if (!isLiveStream) return;
      /** Native iOS + hls.js: let the library rebuffer — edge restarts here cause freeze/pause loops. */
      if (!hlsRef.current && isAppleMobileWebKitDevice()) return;
      if (hlsRef.current) return;
      cancelLiveKickTimer();
      liveKickTimer = setTimeout(() => {
        liveKickTimer = null;
        kickLiveIfBufferLow();
      }, 3200);
    };
    const onPlaying = () => {
      if (!usesTranscodePlayback) setLoading(false);
      else markPictureReady();
      if (!usesTranscodePlayback) setStalled(false);
      stripPosterForWebKit();
      if (v.videoWidth > 0) setLiveAudioNoPicture(false);
      cancelLiveKickTimer();
      cancelLiveMediaErrorDefer();
      if (isLiveStream) {
        livePlaybackErrorSuppressUntilRef.current =
          performance.now() + LIVE_PLAYBACK_ERROR_GRACE_MS;
        setError(null);
        liveProgress.lastCt = -1;
        liveProgress.stuckSince = 0;
      }
    };
    const onTime = () => {
      const nativeAppleLive =
        isLiveStream &&
        !hlsRef.current &&
        isAppleMobileWebKitDevice();

      const uiFlushMs = isLiveStream
        ? chromiumDesktopClient
          ? 800
          : isAppleMobileWebKitDevice()
            ? 300
            : mobileLikeViewport
              ? 400
              : 550
        : 220;

      const nowUi = performance.now();
      if (nowUi - lastUiFlushMs >= uiFlushMs) {
        lastUiFlushMs = nowUi;
        const off = usesTranscodePlayback ? vodStartOffsetRef.current : 0;
        if (!vodScrubbingRef.current) {
          setTime(off + v.currentTime);
        }
        const buf = v.buffered;
        if (buf.length) setBuffered(off + buf.end(buf.length - 1));
      }

      // Progressive VOD with picture but no decodable audio (AC-3/DTS in Chromium) —
      // hard media errors often never fire; boost to server HLS instead.
      if (
        !vodSilentAudioResolved &&
        !isLiveStream &&
        !usesTranscodePlayback &&
        !v.paused &&
        !v.error &&
        v.videoWidth > 0 &&
        v.currentTime >= 2.5
      ) {
        const missing = videoLikelyMissingDecodableAudio(v);
        if (missing === true) {
          vodSilentAudioResolved = true;
          if (requestVodTranscodeFallbackRef.current()) {
            return;
          }
        } else if (missing === false || v.currentTime >= 8) {
          vodSilentAudioResolved = true;
        }
      }

      if (usesTranscodePlayback) {
        if (nowUi - lastMarkPictureMs >= 450) {
          lastMarkPictureMs = nowUi;
          markPictureReady();
        }
        if (!transcodeEndedSignaled && !v.paused && !vodScrubbingRef.current) {
          const rel = v.currentTime;
          if (rel > maxTranscodeRelSeen) maxTranscodeRelSeen = rel;
          const durationSec =
            vodDurationHintRef.current > 1
              ? vodDurationHintRef.current
              : vodTotalSec > 1
                ? vodTotalSec
                : 0;
          const startOffset = vodStartOffsetRef.current;
          const encodedSecRel = vodEncodedSecRef.current;
          const atFinale = shouldTreatTranscodeAsEnded({
            video: v,
            startOffsetSec: startOffset,
            durationSec,
            encodedSecRel,
          });
          const snapFinale = shouldTreatTranscodeSnapAsEnded(
            rel,
            maxTranscodeRelSeen,
            startOffset,
            durationSec
          );
          if (atFinale || snapFinale) {
            transcodeEndedSignaled = true;
            signalTranscodePlaybackEnded({
              video: v,
              hls: hlsRef.current,
            });
          }
        }
      }

      if (
        isLiveStream &&
        !v.paused &&
        v.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
        v.currentTime > 6 &&
        v.videoWidth === 0 &&
        v.videoHeight === 0
      ) {
        setLiveAudioNoPicture(true);
        if (liveNoPictureSince <= 0) liveNoPictureSince = nowUi;
        const sustainedMs = nowUi - liveNoPictureSince;
        if (
          sustainedMs >= 4000 &&
          liveNoPictureRecoveries < 3 &&
          nowUi - lastNoPictureRecoveryMs >= 12_000
        ) {
          lastNoPictureRecoveryMs = nowUi;
          liveNoPictureRecoveries += 1;
          recoverLiveNoPicture();
        }
      } else {
        if (v.videoWidth > 0) {
          setLiveAudioNoPicture(false);
          liveNoPictureSince = 0;
          liveNoPictureRecoveries = 0;
        }
      }

      if (
        !nativeAppleLive &&
        isLiveStream &&
        !v.paused &&
        !v.error &&
        v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        let ahead = 999;
        if (v.buffered.length > 0) {
          ahead = v.buffered.end(v.buffered.length - 1) - v.currentTime;
        }
        const nowMs = performance.now();
        const usingHlsJs = hlsRef.current != null;
        /** hls.js: never manual-seek on low buffer — live sync handles it; seeks cause jumps. */
        const lowAheadKick =
          !usingHlsJs && ahead < 1.05 && v.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
        const lowKickCooldownMs = 12_000;
        if (lowAheadKick && nowMs - lastLowBufferKick > lowKickCooldownMs) {
          lastLowBufferKick = nowMs;
          kickLivePlayback();
        }
      }

      if (!isLiveStream || v.paused) return;

      const ct = v.currentTime;
      const now = performance.now();

      /**
       * Native iPhone/iPad live: skip buffer-low seeks (they cause jumps) but still
       * recover when the decode surface freezes — audio can continue with a stuck frame.
       */
      if (nativeAppleLive) {
        if (
          v.videoWidth > 0 &&
          v.videoHeight > 0 &&
          !v.error &&
          v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          if (liveProgress.lastCt < 0) {
            liveProgress.lastCt = ct;
            liveProgress.stuckSince = now;
          } else if (Math.abs(ct - liveProgress.lastCt) > 0.2) {
            nativeStallKicks = 0;
            liveProgress.lastCt = ct;
            liveProgress.stuckSince = now;
          } else if (
            now - liveProgress.stuckSince > 12_000 &&
            nativeStallKicks < 3
          ) {
            liveProgress.stuckSince = now;
            liveProgress.lastCt = ct;
            nativeStallKicks += 1;
            reloadNativeLiveSource();
          }
        }
        return;
      }

      if (liveProgress.lastCt < 0) {
        liveProgress.lastCt = ct;
        liveProgress.stuckSince = now;
        return;
      }
      if (Math.abs(ct - liveProgress.lastCt) > 0.2) {
        nativeStallKicks = 0;
        liveProgress.lastCt = ct;
        liveProgress.stuckSince = now;
        return;
      }
      const usingHlsJs = hlsRef.current != null;
      const stuckThresholdMs = usingHlsJs
        ? 32_000
        : isAppleMobileWebKitDevice()
          ? 4500
          : 9000;
      if (now - liveProgress.stuckSince > stuckThresholdMs) {
        liveProgress.stuckSince = now;
        liveProgress.lastCt = ct;
        nativeStallKicks += 1;
        if (usingHlsJs) {
          const hls = hlsRef.current;
          if (hls) {
            try {
              applyGentleLiveHlsRecovery(hls, v);
            } catch {
              try {
                hls.recoverMediaError();
              } catch {
                /* noop */
              }
              voidSafeVideoPlay(v);
            }
          }
        } else {
          kickLivePlayback();
          if (nativeStallKicks >= 8) {
            nativeStallKicks = 0;
            reloadNativeLiveSource();
          }
        }
      }
    };
    const onMeta = () => {
      const hint = vodDurationHintRef.current || vodTotalSec;
      if (usesTranscodePlayback) {
        if (hint > 1) applyVodDurationHint(hint);
        if (v.videoWidth > 0) setLiveAudioNoPicture(false);
        return;
      }
      const vd = v.duration;
      const d =
        Number.isFinite(vd) && vd > 1 && vd < 86400
          ? vd
          : hint > 1
            ? hint
            : 0;
      if (d > 0) applyVodDurationHint(d);
      if (v.videoWidth > 0) setLiveAudioNoPicture(false);
    };

    const onLoadedData = () => {
      markPictureReady();
      if (v.videoWidth > 0) setLiveAudioNoPicture(false);
    };
    const onVol = () => {
      setMuted(v.muted);
      setVolume(v.volume);
      schedulePersistPreferredVolume(v.volume);
    };
    const onErr = () => {
      if (!v.error) return;
      const code = v.error.code;
      const vodProgressive =
        current &&
        (current.kind === "movie" || current.kind === "series") &&
        !playbackUrlIsHls(current.url, false);
      const braveIosVod =
        vodProgressive && isBraveOnAppleMobile();
      const liveMidPlayHint =
        current?.kind === "live" ? ` ${liveCodecUserMessage()}` : "";
      const braveIosVodHint =
        " On iPhone, Safari and Brave share the same in-page limits for many MKV/HEVC/Dolby files—VLC/Infuse or your provider's app is the reliable path.";
      const map: Record<number, string> = {
        1: "Playback was aborted.",
        2: "Network error fetching the stream.",
        3: vodProgressive
          ? braveIosVod
            ? `This movie or episode uses codecs or a container mobile browsers can't play in-page (very common with MKV, or MP4 with HEVC/AC‑3).${braveIosVodHint} Or copy the stream link from Share → open in VLC.`
            : !isVodTranscodeEnabledClient()
              ? "This episode or movie uses codecs the browser can't decode (common with MKV, HEVC, or AC-3/DTS audio). Enable STREAM_VOD_TRANSCODE=1 and NEXT_PUBLIC_VOD_TRANSCODE=1 with ffmpeg, rebuild, and try again — or use VLC / your provider's app."
              : "This episode or movie uses codecs or a container in-browser players can't decode (common with MKV, HEVC, or DTS from Xtream). Safari and Brave share many of the same limits—try your provider's native app, VLC/TiviMate, or another encode labeled MP4 / H.264 / AAC if available."
          : current?.kind === "live"
            ? liveCodecUserMessage()
            : `The stream is corrupt or in an unsupported codec.${liveMidPlayHint}`,
        4: vodProgressive
          ? braveIosVod
            ? `The file format isn't playable here (often MKV, or MP4 with codecs WebKit won't decode).${braveIosVodHint}`
            : !isVodTranscodeEnabledClient()
              ? "This file's format or audio codec isn't playable here (often MKV/HEVC, or MP4 with AC-3/DTS). Enable STREAM_VOD_TRANSCODE=1 and NEXT_PUBLIC_VOD_TRANSCODE=1 with ffmpeg, rebuild, and try again — or open it in VLC."
              : "The file uses a format or codec this web player can't play (often MKV or HEVC). That usually isn't a bug: desktop browsers often can't handle what IPTV apps stream fine. Use a native IPTV player or VLC, or pick an MP4 release if your provider lists one."
          : current?.kind === "live"
            ? liveCodecUserMessage()
            : `This stream uses a format or codec your browser can't play here.${liveMidPlayHint}`,
      };

      const hlsNow = hlsRef.current;
      /** Same recovery as Try again — transient MSE hiccups clear without nuking UX if we defer surfacing codec errors. */
      if (
        isLiveStream &&
        hlsNow &&
        (code === 3 || code === 4)
      ) {
        cancelLiveMediaErrorDefer();
        livePlaybackErrorSuppressUntilRef.current =
          performance.now() + LIVE_PLAYBACK_ERROR_GRACE_MS;
        let recoveryPasses = 0;
        const runLiveVideoErrorRecovery = () => {
          const vv = videoRef.current;
          const hls = hlsRef.current;
          if (!vv || !hls) return;
          recoveryPasses += 1;
          try {
            applyGentleLiveHlsRecovery(hls, vv);
          } catch {
            voidSafeVideoPlay(vv);
          }
        };
        runLiveVideoErrorRecovery();
        const persistedCode = code;
        const scheduleDeferCheck = (delayMs: number) => {
          liveMediaErrorDeferTimer = window.setTimeout(() => {
            liveMediaErrorDeferTimer = null;
            if (
              performance.now() < livePlaybackErrorSuppressUntilRef.current
            ) {
              return;
            }
            const vv = videoRef.current;
            if (!vv?.error || vv.error.code !== persistedCode) return;
            if (
              !vv.paused &&
              vv.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            ) {
              setError(null);
              return;
            }
            if (recoveryPasses < 4 && hlsRef.current) {
              runLiveVideoErrorRecovery();
              scheduleDeferCheck(LIVE_VIDEO_ERROR_DEFER_MS);
              return;
            }
            const hlsRetry = hlsRef.current;
            if (hlsRetry) {
              setError(null);
              setLoading(true);
              livePlaybackErrorSuppressUntilRef.current =
                performance.now() + LIVE_PLAYBACK_ERROR_GRACE_MS;
              applyGentleLiveHlsRecovery(hlsRetry, vv);
              scheduleDeferCheck(LIVE_VIDEO_ERROR_DEFER_MS);
              return;
            }
            setError(map[persistedCode] || `Playback error (${persistedCode}).`);
          }, delayMs);
        };
        scheduleDeferCheck(LIVE_VIDEO_ERROR_DEFER_MS);
        return;
      }

      if (
        vodProgressive &&
        (code === 3 || code === 4) &&
        requestVodTranscodeFallbackRef.current()
      ) {
        return;
      }

      setError(map[code] || `Playback error (${code}).`);
    };
    const onEnter = () => setIsPip(true);
    const onLeave = () => setIsPip(false);

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("loadeddata", onLoadedData);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("error", onErr);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      if (volPersistTimer) clearTimeout(volPersistTimer);
      cancelLiveKickTimer();
      cancelLiveMediaErrorDefer();
      cancelLiveMediaErrorDeferRef.current = () => {};
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("loadeddata", onLoadedData);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("error", onErr);
      v.removeEventListener("enterpictureinpicture", onEnter);
      v.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [
    open,
    current,
    usesTranscodePlayback,
    applyVodDurationHint,
    vodTotalSec,
    mobileLikeViewport,
    chromiumDesktopClient,
    videoRef,
    hlsRef,
    hlsLiveEdgeRestartGateRef,
    vodDurationHintRef,
    vodStartOffsetRef,
    vodEncodedSecRef,
    vodScrubbingRef,
    cancelLiveMediaErrorDeferRef,
    livePlaybackErrorSuppressUntilRef,
    requestVodTranscodeFallbackRef,
    setIsPlaying,
    setNeedsTapToPlay,
    setLoading,
    setStalled,
    setTime,
    setBuffered,
    setMuted,
    setVolume,
    setError,
    setLiveAudioNoPicture,
    setVideoHasFrame,
    setVodPrepProgress,
    setIsPip,
  ]);
}
