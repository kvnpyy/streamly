"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type Hls from "hls.js";
import { isAppleMobileWebKitDevice } from "@/lib/browser";
import { writePreferredPlayerVolume } from "@/lib/player-volume-pref";
import { isTvOrSilkUserAgent } from "@/lib/tv-user-agent";
import {
  applyGentleLiveHlsRecovery,
  applySoftLiveHlsRecovery,
  LIVE_PLAYBACK_ERROR_GRACE_MS,
  LIVE_VIDEO_ERROR_DEFER_MS,
  liveCodecUserMessage,
  liveBrowserTranscodeFailedMessage,
  recoverTvLiveMedia,
} from "@/lib/live-hls-playback";
import { playbackUrlIsHls } from "@/lib/playback-url";
import { playbackUrlUsesLiveBrowserTranscode, withLiveHlsCompatMse } from "@/lib/stream-url";
import { voidSafeVideoPlay } from "@/lib/video-play";
import { videoLikelyMissingDecodableAudio } from "@/lib/vod-silent-audio";
import {
  isVodTranscodeEnabledClient,
} from "@/lib/vod-transcode-url";
import type { PlayerSource } from "@/store/player";
import {
  shouldIgnoreOutgoingTranscodeClock,
  shouldTreatTranscodeAsEnded,
  shouldTreatTranscodeSnapAsEnded,
  signalTranscodePlaybackEnded,
  vodTranscodeRecoveryPlayhead,
  vodTranscodeWaitBridgeSec,
  shouldHoldTranscodeSeekTarget,
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
  /** Furthest relative playhead. Restored when a stall snaps playback to the opening. */
  vodPlayheadHighWaterRef: RefObject<number>;
  /**
   * Set when the title changes. The element can still report the previous
   * episode until the next media loads — do not seek that clock.
   */
  vodOutgoingPlayheadRef: RefObject<boolean>;
  mobileLikeViewport: boolean;
  chromiumDesktopClient: boolean;
  cancelLiveMediaErrorDeferRef: RefObject<() => void>;
  livePlaybackErrorSuppressUntilRef: RefObject<number>;
  requestVodTranscodeFallbackRef: RefObject<() => boolean>;
  requestLiveBrowserTranscodeRef: RefObject<() => boolean>;
  liveBrowserPendingRef: RefObject<boolean>;
  /** Raw MPEG-TS (mpegts.js) currently owns the media element. */
  liveMpegtsActiveRef: RefObject<boolean>;
  settleLiveMpegtsRef: RefObject<(action: "hls" | "transcode") => void>;
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
  setMediaClockSec: Dispatch<SetStateAction<number>>;
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
    vodPlayheadHighWaterRef,
    vodOutgoingPlayheadRef,
    mobileLikeViewport,
    chromiumDesktopClient,
    cancelLiveMediaErrorDeferRef,
    livePlaybackErrorSuppressUntilRef,
    requestVodTranscodeFallbackRef,
    requestLiveBrowserTranscodeRef,
    liveBrowserPendingRef,
    liveMpegtsActiveRef,
    settleLiveMpegtsRef,
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
    setMediaClockSec,
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
    let maxTranscodeRelSeen = vodPlayheadHighWaterRef.current;
    let transcodeEndedSignaled = false;
    let lastSnapRestoreMs = 0;
    let sawNewMetadata = false;
    const armedSrc = v.currentSrc;
    const outgoingArmAt = performance.now();

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
      if (liveMpegtsActiveRef.current) return;
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
      if (isTvOrSilkUserAgent()) {
        const hls = hlsRef.current;
        if (hls) recoverTvLiveMedia(hls, vv);
        else voidSafeVideoPlay(vv);
        return;
      }
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
      // Muted autoplay fires `play` immediately. Clearing the prompt here left
      // the episode running with no sound and no way to turn it on.
      if (!v.muted) setNeedsTapToPlay(false);
      if (!usesTranscodePlayback) setStalled(false);
      stripPosterForWebKit();
      if (v.videoWidth > 0) setLiveAudioNoPicture(false);
    };
    let lastVodBridgeMs = 0;
    let userPausedAt = 0;
    let ignoreBridgeUntil = 0;
    let ignoreSnapUntil = 0;
    const onPause = () => {
      setIsPlaying(false);
      userPausedAt = performance.now();
    };
    const onWaiting = () => {
      if (!isLiveStream && usesTranscodePlayback) {
        if (v.paused) return;
        const nowWait = performance.now();
        // Right after a long pause the buffer is full of temporary gaps.
        // Jumping them looks like the episode fast-forwarding.
        if (nowWait < ignoreBridgeUntil) return;
        if (nowWait - lastVodBridgeMs < 1_500) return;
        const ranges: Array<{ start: number; end: number }> = [];
        for (let i = 0; i < v.buffered.length; i++) {
          ranges.push({ start: v.buffered.start(i), end: v.buffered.end(i) });
        }
        const bridge = vodTranscodeWaitBridgeSec(v.currentTime, ranges, false);
        if (bridge != null && bridge > v.currentTime + 0.01) {
          lastVodBridgeMs = nowWait;
          try {
            v.currentTime = bridge;
          } catch {
            /* decoder will catch up on the next waiting tick */
          }
        }
        return;
      }
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
        liveBrowserPendingRef.current = false;
        livePlaybackErrorSuppressUntilRef.current =
          performance.now() + LIVE_PLAYBACK_ERROR_GRACE_MS;
        setError(null);
        liveProgress.lastCt = -1;
        liveProgress.stuckSince = 0;
      }
      if (
        usesTranscodePlayback &&
        userPausedAt > 0 &&
        performance.now() - userPausedAt > 2_000
      ) {
        const quietUntil = performance.now() + 8_000;
        ignoreBridgeUntil = quietUntil;
        ignoreSnapUntil = quietUntil;
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
      if (usesTranscodePlayback && vodOutgoingPlayheadRef.current) {
        const rel = Number.isFinite(v.currentTime) ? v.currentTime : 0;
        const ignore = shouldIgnoreOutgoingTranscodeClock({
          holdOutgoing: true,
          currentRel: rel,
          highWaterRel: vodPlayheadHighWaterRef.current,
        });
        const newMedia =
          sawNewMetadata ||
          v.currentSrc !== armedSrc ||
          performance.now() - outgoingArmAt > 1200;
        if (!ignore && newMedia) {
          vodOutgoingPlayheadRef.current = false;
          maxTranscodeRelSeen = Math.max(
            rel,
            vodPlayheadHighWaterRef.current
          );
        } else {
          // Previous episode is still on the element. Publishing or restoring
          // that clock rewinds it instead of starting the next title.
          return;
        }
      }
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
        if (missing === true || (missing === "unknown" && v.currentTime >= 3)) {
          vodSilentAudioResolved = true;
          if (requestVodTranscodeFallbackRef.current()) {
            return;
          }
        } else if (missing === false) {
          vodSilentAudioResolved = true;
        }
      }

      if (usesTranscodePlayback) {
        if (nowUi - lastMarkPictureMs >= 450) {
          lastMarkPictureMs = nowUi;
          markPictureReady();
        }
        if (vodScrubbingRef.current || shouldHoldTranscodeSeekTarget({
          currentRel: v.currentTime,
          maxSeenRel: maxTranscodeRelSeen,
          watermarkRel: vodPlayheadHighWaterRef.current,
        })) {
          const rel = v.currentTime;
          const cap = vodPlayheadHighWaterRef.current;
          const holding = shouldHoldTranscodeSeekTarget({
            currentRel: rel,
            maxSeenRel: maxTranscodeRelSeen,
            watermarkRel: cap,
          });
          if (holding) {
            maxTranscodeRelSeen = cap;
            if (nowUi - lastSnapRestoreMs > 400) {
              lastSnapRestoreMs = nowUi;
              try {
                v.currentTime = cap;
              } catch {
                /* seek lands once the target fragment is buffered */
              }
              try {
                hlsRef.current?.startLoad(cap);
              } catch {
                /* noop */
              }
            }
            return;
          }
          if (Number.isFinite(rel) && rel >= 0) {
            maxTranscodeRelSeen = rel;
            vodPlayheadHighWaterRef.current = rel;
          }
        } else if (!v.paused) {
          const relNow = v.currentTime;
          const refHigh = vodPlayheadHighWaterRef.current;
          // A backward scrub writes the watermark before the element lands.
          // Follow it across a long jump — a 20s window left hour-long rewinds
          // looking like an HLS snap, and playing episodes jumped back to the tip.
          if (
            Number.isFinite(relNow) &&
            Number.isFinite(refHigh) &&
            refHigh + 1 < maxTranscodeRelSeen
          ) {
            maxTranscodeRelSeen = refHigh;
          }
          const rel = v.currentTime;
          if (rel > maxTranscodeRelSeen) {
            maxTranscodeRelSeen = rel;
            vodPlayheadHighWaterRef.current = rel;
          } else if (!transcodeEndedSignaled && nowUi >= ignoreSnapUntil) {
            const restore = vodTranscodeRecoveryPlayhead({
              currentRel: rel,
              highWaterRel: maxTranscodeRelSeen,
            });
            if (restore > rel + 0.75 && nowUi - lastSnapRestoreMs > 1_500) {
              lastSnapRestoreMs = nowUi;
              try {
                v.currentTime = restore;
              } catch {
                /* buffer may still be filling at the previous playhead */
              }
              try {
                hlsRef.current?.startLoad(restore);
              } catch {
                /* noop */
              }
              return;
            }
          }
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
      /**
       * hls.js live (desktop, phone, and TV) is owned by the playhead poll.
       * timeupdate stops when the decoder wedges, and recoverMediaError from
       * this handler seeks the sliding window.
       */
      if (usingHlsJs || isTvOrSilkUserAgent()) return;
      const stuckThresholdMs = isAppleMobileWebKitDevice() ? 4500 : 9000;
      if (now - liveProgress.stuckSince > stuckThresholdMs) {
        liveProgress.stuckSince = now;
        liveProgress.lastCt = ct;
        nativeStallKicks += 1;
        kickLivePlayback();
        if (nativeStallKicks >= 8) {
          nativeStallKicks = 0;
          reloadNativeLiveSource();
        }
      }
    };
    const noteMediaClock = () => {
      if (isLiveStream) return;
      const vd = v.duration;
      if (Number.isFinite(vd) && vd > 1 && vd < 86400) {
        setMediaClockSec(vd);
      }
    };

    const onMeta = () => {
      const rel = Number.isFinite(v.currentTime) ? v.currentTime : 0;
      if (
        v.currentSrc !== armedSrc ||
        !shouldIgnoreOutgoingTranscodeClock({
          holdOutgoing: vodOutgoingPlayheadRef.current,
          currentRel: rel,
          highWaterRel: vodPlayheadHighWaterRef.current,
        })
      ) {
        sawNewMetadata = true;
      }
      noteMediaClock();
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

    const onDurationChange = () => {
      if (isLiveStream) return;
      noteMediaClock();
      if (usesTranscodePlayback) return;
      const vd = v.duration;
      if (Number.isFinite(vd) && vd > 1 && vd < 86400) {
        applyVodDurationHint(vd);
      }
    };

    const onLoadedData = () => {
      markPictureReady();
      if (v.videoWidth > 0) setLiveAudioNoPicture(false);
    };
    const onVol = () => {
      setMuted(v.muted);
      // iOS reports element volume as 1 and does not honor script writes.
      // Persisting it would wipe a desktop volume preference.
      if (isAppleMobileWebKitDevice()) return;
      setVolume(v.volume);
      schedulePersistPreferredVolume(v.volume);
    };
    const onErr = () => {
      if (!v.error) return;
      const code = v.error.code;
      if (
        isLiveStream &&
        liveMpegtsActiveRef.current &&
        (code === 2 || code === 3 || code === 4)
      ) {
        if (code === 3 && !isAppleMobileWebKitDevice()) {
          settleLiveMpegtsRef.current("transcode");
        } else {
          settleLiveMpegtsRef.current("hls");
        }
        return;
      }
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

      const offerPhoneFriendlyLive = (): boolean => {
        if (!isLiveStream || (code !== 3 && code !== 4)) return false;
        const src = v.currentSrc || v.src || "";
        if (playbackUrlUsesLiveBrowserTranscode(src)) {
          setLoading(false);
          setStalled(false);
          setError(liveBrowserTranscodeFailedMessage());
          return true;
        }
        return requestLiveBrowserTranscodeRef.current();
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
            if (isTvOrSilkUserAgent()) {
              if (recoveryPasses <= 1) {
                voidSafeVideoPlay(vv);
              } else {
                recoverTvLiveMedia(hls, vv);
              }
            } else {
              applyGentleLiveHlsRecovery(hls, vv);
            }
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
            if (
              (persistedCode === 3 || persistedCode === 4) &&
              offerPhoneFriendlyLive()
            ) {
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

      if (
        (code === 3 || code === 4) &&
        offerPhoneFriendlyLive()
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
    v.addEventListener("durationchange", onDurationChange);
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
      v.removeEventListener("durationchange", onDurationChange);
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
    vodPlayheadHighWaterRef,
    vodOutgoingPlayheadRef,
    cancelLiveMediaErrorDeferRef,
    livePlaybackErrorSuppressUntilRef,
    requestVodTranscodeFallbackRef,
    requestLiveBrowserTranscodeRef,
    liveBrowserPendingRef,
    liveMpegtsActiveRef,
    settleLiveMpegtsRef,
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
    setMediaClockSec,
  ]);
}
