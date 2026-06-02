"use client";

import { cn, formatTime } from "@/lib/utils";
import { useShortEPG, useFullEPG, decodeEpgText } from "@/lib/hooks";
import {
  epgListingsHaveParsableTimes,
  epgProgramRangeUnixSec,
} from "@/lib/epg-time";
import {
  buildImageProxy,
  buildImageProxyAbsolute,
} from "@/lib/image-proxy";
import { buildCastMediaDescriptor } from "@/lib/cast-media-url";
import {
  appendVodTranscodeHls,
  buildVodTranscodeRetryUrl,
  buildVodTranscodeSeekUrl,
  canVodTranscodeProxyUrl,
  isVodTranscodeEnabledClient,
  playbackUrlUsesVodTranscode,
  vodContainerNeedsServerPrep,
  warmVodTranscodePlay,
} from "@/lib/vod-transcode-url";
import { TvPlayerRemoteHints } from "@/components/TvPlayerRemoteHints";
import { VodPrepareOverlay } from "@/components/VodPrepareOverlay";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { useAuth } from "@/store/auth";
import { usePlayer, type PlayerSource } from "@/store/player";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import {
  buildSortedEpgRows,
  useTickingClockMs,
  type PlayerEpgListing,
} from "@/components/player/PlayerEpgSchedule";
import { useHlsRuntime } from "@/hooks/use-hls-runtime";
import { usePlayerCast } from "@/hooks/player/use-player-cast";
import { usePlayerLiveSupplements } from "@/hooks/player/use-player-live-supplements";
import { usePlayerPlaybackPipeline } from "@/hooks/player/use-player-playback-pipeline";
import { usePlayerStallEscalation } from "@/hooks/player/use-player-stall-escalation";
import { usePlayerVideoEvents } from "@/hooks/player/use-player-video-events";
import { usePlayerVodResume } from "@/hooks/player/use-player-vod-resume";
import { PlayerStallOverlay } from "@/components/player/PlayerStallOverlay";
import { AnimatePresence, motion } from "framer-motion";
import type Hls from "hls.js";
import type { Level } from "hls.js";
import {
  chromiumWalletExtensionPlaybackHint,
  isAppleMobileWebKitDevice,
  isChromiumBasedDesktopBrowser,
} from "@/lib/browser";
import {
  applySoftLiveHlsRecovery,
  hlsRenditionLabel,
} from "@/lib/live-hls-playback";
import {
  isPictureInPictureSupported,
  toggleVideoPictureInPicture,
} from "@/lib/picture-in-picture";
import { playbackBreadcrumb } from "@/lib/playback-telemetry";
import { withLiveHlsCompatMse } from "@/lib/stream-url";
import { safeVideoPlay, voidSafeVideoPlay } from "@/lib/video-play";
import { isAmazonSilkUserAgent } from "@/lib/tv-user-agent";
import {
  isPlayPauseShortcutKey,
  isPlayerControlKeyboardTarget,
  isRemoteActivateKey,
  liveChannelFlipKeyDelta,
} from "@/lib/player-control-target";
import { isLivingRoomPlaybackClient } from "@/lib/tv-playback-tune";
import {
  CalendarClock,
  Check,
  ChevronUp,
  ChevronDown,
  Copy,
  Info,
  Maximize2,
  Minimize2,
  PanelBottomClose,
  Pause,
  Play,
  PictureInPicture,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const PlayerEpgDrawer = dynamic(
  () =>
    import("@/components/player/PlayerEpgDrawer").then((m) => m.PlayerEpgDrawer),
  { ssr: false }
);

const PlayerControlMenus = dynamic(
  () =>
    import("@/components/player/PlayerControlMenus").then(
      (m) => m.PlayerControlMenus
    ),
  { ssr: false }
);

type SubtitleTrack = {
  id: number; // -1 = off
  label: string;
  lang?: string;
  source: "hls" | "native";
};

/**
 * Brave on iPhone/iPad (WKWebView). Apple only wires reliable native video fullscreen to Safari;
 * third-party browsers often get a no-op from `webkitEnterFullscreen` / presentation mode.
 */
function isBraveOnAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!isAppleMobileWebKitDevice()) return false;
  return /\bBrave\b/i.test(navigator.userAgent || "");
}

/** iOS WebKit — native video fullscreen; Fullscreen API on a div often unsupported on iPhone. */
type VideoWebKit = HTMLVideoElement & {
  webkitSupportsFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  /** Preferred on some WKWebView builds (Brave iOS) when webkitEnterFullscreen is flaky. */
  webkitSetPresentationMode?: (mode: "inline" | "fullscreen") => void;
  webkitPresentationMode?: string;
};

function requestDomFullscreen(target: Element): void {
  const el = target as Element & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };
  const fn =
    el.requestFullscreen?.bind(el) ??
    el.webkitRequestFullscreen?.bind(el) ??
    el.msRequestFullscreen?.bind(el);
  if (!fn) return;
  void Promise.resolve(fn()).catch(() => {
    /* noop */
  });
}

/** Stop TV remotes from bubbling OK/Space to the global play/pause shortcut. */
function swallowRemoteActivateKeys(e: React.KeyboardEvent) {
  if (isRemoteActivateKey(e.key)) e.stopPropagation();
}

function swallowControlPointer(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const flipControlActivateGateMs = 350;
let lastFlipControlActivateAt = 0;

/** TV browsers often skip `click`; pointer-up + OK still zaps immediately. */
function activateFlipControl(
  e: React.SyntheticEvent,
  action: () => void
) {
  e.stopPropagation();
  if ("preventDefault" in e && typeof e.preventDefault === "function") {
    e.preventDefault();
  }
  const now = Date.now();
  if (now - lastFlipControlActivateAt < flipControlActivateGateMs) return;
  lastFlipControlActivateAt = now;
  action();
}

export function PlayerOverlay() {
  const { current, open, close, flip, playlist, index } = usePlayer();
  const hlsRuntime = useHlsRuntime(open);
  const tvBrowser = useTvBrowser();
  const livingRoomPlayback = useMemo(() => {
    if (tvBrowser) return true;
    if (typeof navigator === "undefined") return false;
    return isLivingRoomPlaybackClient(navigator.userAgent);
  }, [tvBrowser]);
  const silkLikeClient = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return isAmazonSilkUserAgent(navigator.userAgent || "");
  }, []);
  const mobileLikeViewport = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      tvBrowser ||
      silkLikeClient ||
      window.matchMedia("(max-width: 768px)").matches
    );
  }, [tvBrowser, silkLikeClient]);
  const chromiumDesktopClient = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return isChromiumBasedDesktopBrowser();
  }, []);
  const canFlip = !!playlist && playlist.items.length > 1;
  /** Live channel flip or series episode flip (↑/↓ and toolbar buttons). */
  const flipWithArrowKeys =
    canFlip &&
    !!current &&
    (current.kind === "live" || current.kind === "series");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Lower-third horizontal drag scrubs VOD; tap still toggles play/pause. */
  const vodGestureStripRef = useRef<HTMLDivElement | null>(null);
  const vodScrubPointerRef = useRef<{
    pointerId: number;
    startX: number;
    startTime: number;
    moved: boolean;
  } | null>(null);
  const hlsRef = useRef<InstanceType<typeof Hls> | null>(null);
  /** ffprobe duration for in-progress VOD transcode HLS (video.duration is often NaN until encode finishes). */
  const vodDurationHintRef = useRef(0);
  /** Absolute timeline: where the current HLS playlist begins in the source file. */
  const vodStartOffsetRef = useRef(0);
  /** How many seconds of media exist in the current transcode playlist. */
  const vodEncodedSecRef = useRef(0);
  const vodSeekRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [vodTotalSec, setVodTotalSec] = useState(0);
  /** Throttles automatic `startLoad(-1)` storms on live HLS (see `tryHlsLiveEdgeRestart`). */
  const hlsLiveEdgeRestartGateRef = useRef(0);
  /** Bumped on Try again — stale defer timers / old hls handlers must not re-show the overlay. */
  const livePlaybackRecoveryGenRef = useRef(0);
  /** Live Try again: first tap soft-reloads; second tap full pipeline reset. */
  const liveTryAgainStrikeRef = useRef(0);
  /** After recovery, suppress fatal overlays while MSE restabilizes (stops 2s re-error loop). */
  const livePlaybackErrorSuppressUntilRef = useRef(0);
  const cancelLiveMediaErrorDeferRef = useRef<() => void>(() => {});
  /** Desktop Chromium live defaults to lowest safe rendition; set true when user picks Quality → Auto. */
  const userChoseAutoHlsQualityRef = useRef(false);
  /** After user opens Quality once, stop re-pinning lowest-safe on each manifest refresh. */
  const userTouchedHlsQualityRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const showControlsRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Latest `/api/stream` correlation id (frag/manifest XHR or VOD probe); shown on fatal playback errors for support. */
  const [streamSupportRequestId, setStreamSupportRequestId] = useState<
    string | null
  >(null);
  const streamSupportRequestIdRef = useRef<string | null>(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [stalled, setStalled] = useState(false);
  /** Overrides `current.url` when falling back to server HLS transcode for MKV/HEVC VOD. */
  const [vodPlaybackUrl, setVodPlaybackUrl] = useState<string | null>(null);
  const [vodTranscodeBoost, setVodTranscodeBoost] = useState(false);
  const [videoHasFrame, setVideoHasFrame] = useState(false);
  const [vodPrepStartedAt, setVodPrepStartedAt] = useState<number | null>(null);
  const [vodPrepProgress, setVodPrepProgress] = useState(8);
  const [playbackRetryKey, setPlaybackRetryKey] = useState(0);
  const vodTriedTranscodeRef = useRef(false);
  const vodPrepKickRef = useRef<AbortController | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<number>(-1); // -1 = off
  const [showSettings, setShowSettings] = useState(false);
  const [showSubs, setShowSubs] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showEpg, setShowEpg] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedPageUrl, setCopiedPageUrl] = useState(false);
  const [dismissBraveFullscreenBanner, setDismissBraveFullscreenBanner] =
    useState(false);
  const [isFs, setIsFs] = useState(false);
  /** Mirrors `isFs` for synchronous fullscreen handlers (iOS requires zero async before webkitEnterFullscreen). */
  const isFsRef = useRef(false);
  /** Dedupe pointerdown (touch) + click so fullscreen isn’t toggled twice on iPhone. */
  const fullscreenTouchHandledRef = useRef(false);
  /** Native `touchend` (capture) calls fullscreen — survives WKWebView/React gesture quirks. */
  const fullscreenIosBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    isFsRef.current = isFs;
  }, [isFs]);
  const [isPip, setIsPip] = useState(false);
  const [pipReady, setPipReady] = useState(false);
  /** Live: Safari sometimes decodes audio but paints no picture (poster glitch, audio-only variant, or codec/compositor edge case). */
  const [liveAudioNoPicture, setLiveAudioNoPicture] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Hide timer must read latest playback/panel state — stale `isPlaying` in closures kept TV controls visible during series. */
  const isPlayingRef = useRef(isPlaying);
  const playerPanelsOpenRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    playerPanelsOpenRef.current =
      showSettings || showSubs || showShare || showEpg;
  }, [showSettings, showSubs, showShare, showEpg]);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeFetchRef = useRef<AbortController | null>(null);
  const fragLoadDowngradeRef = useRef(0);
  const flipOverlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flipPing, setFlipPing] = useState(0);

  const doFlip = useCallback(
    (delta: number, immediate = false) => {
      if (!canFlip) return;
      flip(delta, immediate ? { immediate: true } : undefined);
      setFlipPing((n) => n + 1);
      if (flipOverlayTimer.current) clearTimeout(flipOverlayTimer.current);
      flipOverlayTimer.current = setTimeout(() => setFlipPing(0), 1400);
    },
    [canFlip, flip]
  );
  const flipControlClass = livingRoomPlayback
    ? "grid size-12 place-items-center rounded-xl bg-white/15 hover:bg-white/25 active:bg-white/30 text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
    : "grid size-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-white transition-colors";

  const isLive = current?.kind === "live";
  const creds = useAuth((s) => s.creds);
  const liveStreamId = isLive ? current?.id : undefined;
  /** Header “Now:” only while player is open — no background EPG when overlay is closed. */
  const epgShort = useShortEPG(liveStreamId, 24, open && !!liveStreamId);
  /** Full multi-day grid only when Schedule drawer is open (was freezing main thread + layout). */
  const epgFull = useFullEPG(liveStreamId, !!liveStreamId && showEpg);

  const epgHeaderListings = useMemo(() => {
    const fromShort =
      epgShort.status === "success"
        ? (epgShort.data?.epg_listings ?? [])
        : [];
    if (epgListingsHaveParsableTimes(fromShort)) return fromShort as PlayerEpgListing[];
    return [];
  }, [epgShort.status, epgShort.data]);

  const epgDrawerListings = useMemo(() => {
    const fromFull =
      epgFull.status === "success" ? (epgFull.data?.epg_listings ?? []) : [];
    const fromShort =
      epgShort.status === "success"
        ? (epgShort.data?.epg_listings ?? [])
        : [];
    if (
      epgListingsHaveParsableTimes(fromFull) &&
      fromFull.length > 0
    ) {
      return fromFull as PlayerEpgListing[];
    }
    if (epgListingsHaveParsableTimes(fromShort)) return fromShort as PlayerEpgListing[];
    return [];
  }, [epgFull.status, epgFull.data, epgShort.status, epgShort.data]);

  const epgDrawerRows = useMemo(
    () => buildSortedEpgRows(epgDrawerListings),
    [epgDrawerListings]
  );

  const epgScheduleLoading =
    showEpg &&
    epgDrawerRows.length === 0 &&
    (epgFull.isFetching || epgShort.isLoading);

  const clockMs = useTickingClockMs(
    open && isLive && showEpg ? 60_000 : null,
    open && isLive && showEpg ? epgHeaderListings : null
  );

  /** Provider URL for copy/open-in-VLC (not used for Chromecast). */
  const directUrl = useMemo(() => {
    if (!current || !creds) return null;
    const base = creds.server.replace(/\/+$/, "");
    if (current.kind === "live") {
      return `${base}/live/${creds.username}/${creds.password}/${current.id}.m3u8`;
    }
    const ext = current.containerExt || "mp4";
    const streamId = current.streamId ?? current.id;
    return `${base}/${current.kind}/${creds.username}/${creds.password}/${streamId}.${ext}`;
  }, [current, creds]);

  const castMedia = useMemo(() => {
    if (!current || typeof window === "undefined") return null;
    return buildCastMediaDescriptor({
      origin: window.location.origin,
      current,
      isLive,
      proxyPlaybackUrl: vodPlaybackUrl ?? current.url,
    });
  }, [current, isLive, vodPlaybackUrl]);

  /** Same-origin poster via /api/img — avoids CORS when panel logos are raw http(s) URLs. */
  const posterSrc = useMemo(
    () => (current?.poster ? buildImageProxy(current.poster) : undefined),
    [current]
  );

  const activePlaybackUrl = vodPlaybackUrl ?? current?.url ?? "";
  const usesTranscodePlayback = useMemo(
    () => playbackUrlUsesVodTranscode(activePlaybackUrl),
    [activePlaybackUrl]
  );
  /** Prep UI from first frame of open — not only after transcode URL is active (avoids long black screen on native probe). */
  const vodPrepEligible = useMemo(() => {
    if (!open || !current || isLive) return false;
    if (!isVodTranscodeEnabledClient()) return false;
    return (
      usesTranscodePlayback ||
      vodTranscodeBoost ||
      vodContainerNeedsServerPrep(current.containerExt)
    );
  }, [
    open,
    current,
    isLive,
    usesTranscodePlayback,
    vodTranscodeBoost,
  ]);
  const showVodPrepare =
    vodPrepEligible && !videoHasFrame && !error;
  const quickVodPlayerOpen = vodPrepEligible && !videoHasFrame;

  useEffect(() => {
    vodStartOffsetRef.current = 0;
    vodEncodedSecRef.current = 0;
    queueMicrotask(() => {
      setVideoHasFrame(false);
      setVodPrepProgress(8);
      if (!vodPrepEligible) {
        setVodPrepStartedAt(null);
        return;
      }
      setVodPrepStartedAt((prev) => prev ?? Date.now());
    });
  }, [current?.url, vodPlaybackUrl, vodPrepEligible]);

  /** Slow server encode — nudge bar; hard fail only if decode never starts. */
  useEffect(() => {
    if (!showVodPrepare || !vodPrepStartedAt) return;
    const slowId = window.setTimeout(() => {
      setVodPrepProgress((p) => Math.max(p, 22));
    }, 12_000);
    const failId = window.setTimeout(() => {
      void (async () => {
        const v = videoRef.current;
        if (v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
        const manifestUrl = vodPlaybackUrl ?? current?.url ?? "";
        if (playbackUrlUsesVodTranscode(manifestUrl)) {
          try {
            const res = await fetch(manifestUrl, { credentials: "same-origin" });
            const body = (await res.text()).trim().slice(0, 220);
            if (res.status === 503) {
              setError(
                body ||
                  "Server is busy preparing other videos. Wait a minute, then try again."
              );
              return;
            }
            if (res.status === 502 || res.status === 404) {
              setError(
                body ||
                  "Could not prepare this file for browser playback. Try again or use a native IPTV app."
              );
              return;
            }
          } catch {
            /* noop */
          }
        }
        setError(
          "This episode is taking unusually long to prepare. Check your connection, then try Play again — or use a native IPTV app for MKV files."
        );
      })();
    }, 90_000);
    return () => {
      window.clearTimeout(slowId);
      window.clearTimeout(failId);
    };
  }, [showVodPrepare, vodPrepStartedAt, current?.url, vodPlaybackUrl]);

  /** After Try again: surface a clear error instead of an endless prep/spinner loop. */
  useEffect(() => {
    if (!showVodPrepare || playbackRetryKey === 0) return;
    const failMs = 55_000;
    const failId = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
      setError(
        "Still couldn't start transcoded playback. Your provider may be slow or blocking the file — wait a minute, then try again, or use a native IPTV app for MKV files."
      );
    }, failMs);
    return () => window.clearTimeout(failId);
  }, [showVodPrepare, playbackRetryKey, current?.url, vodPlaybackUrl]);

  const applyVodDurationHint = useCallback((sec: number) => {
    if (!Number.isFinite(sec) || sec <= 1) return;
    vodDurationHintRef.current = sec;
    setVodTotalSec(sec);
    setDuration((d) => (d > sec * 0.95 ? d : sec));
  }, []);

  const applyVodTranscodeTimelineHints = useCallback(
    (hints: { startOffset?: number; encoded?: number }) => {
      if (hints.startOffset != null && hints.startOffset >= 0) {
        vodStartOffsetRef.current = hints.startOffset;
      }
      if (hints.encoded != null && hints.encoded > 0) {
        vodEncodedSecRef.current = hints.encoded;
      }
    },
    []
  );

  const transcodeSeekNeedsServerRestart = useCallback((absoluteSec: number) => {
    const off = vodStartOffsetRef.current;
    const encoded = vodEncodedSecRef.current;
    const relative = absoluteSec - off;
    if (relative < -1) return true;
    if (encoded < 2) return absoluteSec > 2;
    return relative >= encoded - 2;
  }, []);

  const restartTranscodeAtSeek = useCallback(
    (absoluteSec: number) => {
      if (!current || current.kind === "live") return;
      const active = vodPlaybackUrl ?? current.url;
      const url = buildVodTranscodeSeekUrl(active, current.url, absoluteSec, {
        compatMse: tvBrowser || silkLikeClient,
      });
      if (!url) return;

      vodTriedTranscodeRef.current = true;
      setVodTranscodeBoost(true);
      vodStartOffsetRef.current = Math.max(0, Math.floor(absoluteSec));
      vodEncodedSecRef.current = 0;
      setVodPrepProgress(8);
      setVodPrepStartedAt(Date.now());
      setVideoHasFrame(false);
      setError(null);
      setTime(Math.max(0, absoluteSec));

      const v = videoRef.current;
      if (v) {
        try {
          if (hlsRef.current) {
            hlsRef.current.stopLoad();
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
          v.pause();
          v.removeAttribute("src");
          v.load();
        } catch {
          /* noop */
        }
      }

      setVodPlaybackUrl(url);
      setPlaybackRetryKey((k) => k + 1);
    },
    [current, tvBrowser, silkLikeClient, vodPlaybackUrl]
  );

  const retryPlayback = useCallback(() => {
    setError(null);
    setStreamSupportRequestId(null);
    setVideoHasFrame(false);
    setVodPrepProgress(8);
    setVodPrepStartedAt(Date.now());
    setStalled(false);
    setNeedsTapToPlay(false);

    vodPrepKickRef.current?.abort();
    vodPrepKickRef.current = null;

    const v = videoRef.current;
    if (v) {
      try {
        if (hlsRef.current) {
          hlsRef.current.stopLoad();
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {
        /* noop */
      }
    }

    if (current && current.kind !== "live" && isVodTranscodeEnabledClient()) {
      const active = vodPlaybackUrl ?? current.url;
      const retryUrl = buildVodTranscodeRetryUrl(active, current.url, {
        compatMse: tvBrowser || silkLikeClient,
      });
      if (retryUrl) {
        vodTriedTranscodeRef.current = true;
        setVodTranscodeBoost(true);
        setVodPlaybackUrl(retryUrl);
        setLoading(false);
        const kick = new AbortController();
        vodPrepKickRef.current = kick;
        void fetch(retryUrl, {
          credentials: "same-origin",
          cache: "no-store",
          signal: kick.signal,
        }).catch(() => {});
      } else if (
        vodContainerNeedsServerPrep(current.containerExt) &&
        canVodTranscodeProxyUrl(current.url)
      ) {
        vodTriedTranscodeRef.current = true;
        setVodTranscodeBoost(true);
        const url = appendVodTranscodeHls(current.url, {
          compatMse: tvBrowser || silkLikeClient,
          resetCache: true,
        });
        setVodPlaybackUrl(url);
        setLoading(false);
        const kick = new AbortController();
        vodPrepKickRef.current = kick;
        void fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          signal: kick.signal,
        }).catch(() => {});
      } else {
        setLoading(true);
      }
    } else {
      setLoading(true);
    }

    setPlaybackRetryKey((k) => k + 1);
  }, [current, tvBrowser, silkLikeClient, vodPlaybackUrl]);

  const requestVodTranscodeFallback = useCallback((): boolean => {
    if (!current || current.kind === "live") return false;
    if (vodTriedTranscodeRef.current) return false;
    if (!isVodTranscodeEnabledClient()) return false;
    if (!canVodTranscodeProxyUrl(current.url)) return false;
    vodTriedTranscodeRef.current = true;
    setVodTranscodeBoost(true);
    setVodPlaybackUrl(
      appendVodTranscodeHls(current.url, {
        compatMse: tvBrowser || silkLikeClient,
      })
    );
    setError(null);
    setStalled(false);
    setLoading(true);
    return true;
  }, [current, tvBrowser, silkLikeClient]);

  const requestVodTranscodeFallbackRef = useRef(requestVodTranscodeFallback);
  useEffect(() => {
    requestVodTranscodeFallbackRef.current = requestVodTranscodeFallback;
  }, [requestVodTranscodeFallback]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !current) {
      vodTriedTranscodeRef.current = false;
      queueMicrotask(() => {
        setVodPlaybackUrl(null);
        setVodTranscodeBoost(false);
      });
      return;
    }
    const preferServerTranscode =
      isVodTranscodeEnabledClient() &&
      vodContainerNeedsServerPrep(current.containerExt) &&
      canVodTranscodeProxyUrl(current.url);
    queueMicrotask(() => {
      if (preferServerTranscode) {
        vodTriedTranscodeRef.current = true;
        setVodTranscodeBoost(true);
        warmVodTranscodePlay(current.url, {
          compatMse: tvBrowser || silkLikeClient,
        });
        setVodPlaybackUrl(
          appendVodTranscodeHls(current.url, {
            compatMse: tvBrowser || silkLikeClient,
          })
        );
      } else {
        setVodPlaybackUrl(current.url);
        setVodTranscodeBoost(false);
        vodTriedTranscodeRef.current = false;
      }
    });
  }, [open, current, tvBrowser, silkLikeClient]);

  // iOS / older WebKit: redundant playsinline attrs avoid fullscreen-only decode paths.
  useEffect(() => {
    if (!open || !current) return;
    const v = videoRef.current;
    if (!v) return;
    v.setAttribute("playsinline", "true");
    v.setAttribute("webkit-playsinline", "true");
  }, [open, current]);

  usePlayerPlaybackPipeline({
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
    vodPrepKickRef,
    vodSeekRestartTimerRef,
    stallTimer,
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
    setLiveAudioNoPicture,
    setLoading,
    setVolume,
    setVideoHasFrame,
    setVodPrepProgress,
    applyVodDurationHint,
    applyVodTranscodeTimelineHints,
  });

  usePlayerVodResume({
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
  });

  usePlayerLiveSupplements({
    open,
    current,
    chromiumDesktopClient,
    silkLikeClient,
    mobileLikeViewport,
    videoRef,
    hlsRef,
    playlist,
    index,
  });

  usePlayerVideoEvents({
    open,
    current,
    videoRef,
    hlsRef,
    usesTranscodePlayback,
    vodTotalSec,
    vodDurationHintRef,
    vodStartOffsetRef,
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
  });

  // Native subtitle track detection (e.g. mp4 with embedded subs)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onAdd = () => {
      const native: SubtitleTrack[] = Array.from(v.textTracks).map((t, i) => ({
        id: i,
        label: t.label || t.language || `Subtitle ${i + 1}`,
        lang: t.language,
        source: "native" as const,
      }));
      // Don't clobber HLS-provided subtitles
      setSubtitles((prev) =>
        prev.some((s) => s.source === "hls") ? prev : native
      );
    };
    v.textTracks?.addEventListener?.("addtrack", onAdd);
    return () => v.textTracks?.removeEventListener?.("addtrack", onAdd);
  }, [open, current]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) voidSafeVideoPlay(v, () => setNeedsTapToPlay(true));
    else v.pause();
  }, []);

  const getPlaybackDuration = useCallback(() => {
    if (isLive) return 0;
    if (vodTotalSec > 1) return vodTotalSec;
    const v = videoRef.current;
    const hint = vodDurationHintRef.current;
    const vd = v?.duration;
    if (Number.isFinite(vd) && vd && vd > 1 && vd < 86400) return vd;
    if (hint > 1) return hint;
    return duration > 1 && Number.isFinite(duration) ? duration : 0;
  }, [isLive, vodTotalSec, duration]);

  const seekVideoTo = useCallback(
    (absoluteSeconds: number) => {
      const v = videoRef.current;
      if (!v || isLive) return;
      const dur = getPlaybackDuration();
      if (!dur || !Number.isFinite(dur)) return;
      const absolute = Math.max(0, Math.min(dur - 0.25, absoluteSeconds));

      if (usesTranscodePlayback && transcodeSeekNeedsServerRestart(absolute)) {
        if (vodSeekRestartTimerRef.current) {
          clearTimeout(vodSeekRestartTimerRef.current);
        }
        vodSeekRestartTimerRef.current = setTimeout(() => {
          vodSeekRestartTimerRef.current = null;
          restartTranscodeAtSeek(absolute);
        }, 320);
        setTime(absolute);
        return;
      }

      const off = vodStartOffsetRef.current;
      const relative = usesTranscodePlayback
        ? Math.max(0, absolute - off)
        : absolute;
      const hls = hlsRef.current;
      if (hls && usesTranscodePlayback) {
        try {
          hls.startLoad(relative);
        } catch {
          /* noop */
        }
      }
      try {
        v.currentTime = relative;
      } catch {
        /* noop */
      }
      requestAnimationFrame(() => {
        try {
          if (Math.abs(v.currentTime - relative) > 0.5) {
            v.currentTime = relative;
          }
        } catch {
          /* noop */
        }
      });
      setTime(absolute);
      voidSafeVideoPlay(v);
    },
    [
      isLive,
      getPlaybackDuration,
      usesTranscodePlayback,
      transcodeSeekNeedsServerRestart,
      restartTranscodeAtSeek,
    ]
  );

  const seek = useCallback(
    (delta: number) => {
      if (isLive) return;
      seekVideoTo(time + delta);
    },
    [isLive, seekVideoTo, time]
  );

  const setMute = useCallback((m: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = m;
  }, []);

  const setVol = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    if (val > 0 && v.muted) v.muted = false;
  }, []);

  const onSeekInput = useCallback(
    (e: React.FormEvent) => {
      if (isLive) return;
      const el = e.currentTarget;
      if (!(el instanceof HTMLInputElement)) return;
      const dur = getPlaybackDuration();
      if (!dur) return;
      setTime((parseFloat(el.value) / 100) * dur);
    },
    [isLive, getPlaybackDuration]
  );

  const onSeekCommit = useCallback(
    (e: React.SyntheticEvent) => {
      if (isLive) return;
      const el = e.currentTarget;
      if (!(el instanceof HTMLInputElement)) return;
      const dur = getPlaybackDuration();
      if (!dur) return;
      seekVideoTo((parseFloat(el.value) / 100) * dur);
    },
    [isLive, getPlaybackDuration, seekVideoTo]
  );

  /**
   * Chrome / Brave / Edge / Arc (Chromium) on macOS & Windows: ties the player to the OS media overlay,
   * taskbar mini-player, Bluetooth headset buttons, and keyboard media keys where supported.
   */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    const clearHandlers = () => {
      const actions: MediaSessionAction[] = [
        "play",
        "pause",
        "stop",
        "seekbackward",
        "seekforward",
        "previoustrack",
        "nexttrack",
      ];
      for (const a of actions) {
        try {
          ms.setActionHandler(a, null);
        } catch {
          /* action not supported */
        }
      }
    };

    if (!open || !current) {
      clearHandlers();
      ms.metadata = null;
      ms.playbackState = "none";
      return;
    }

    const artwork: MediaImage[] = [];
    const href = buildImageProxyAbsolute(current.poster);
    if (href) {
      artwork.push({ src: href, sizes: "512x512", type: "image/jpeg" });
    }

    try {
      ms.metadata = new MediaMetadata({
        title: current.title,
        artist:
          current.subtitle ||
          (current.kind === "live"
            ? "Live TV"
            : current.kind === "series"
              ? "Series"
              : "Movie"),
        album:
          current.kind === "live"
            ? "Live"
            : current.kind === "series"
              ? "Episodes"
              : "Movies",
        ...(artwork.length ? { artwork } : {}),
      });
    } catch {
      /* MediaMetadata throws on some invalid artwork strings */
    }

    ms.playbackState = isPlaying ? "playing" : "paused";

    try {
      ms.setActionHandler("play", () => {
        togglePlay();
      });
      ms.setActionHandler("pause", () => {
        togglePlay();
      });
      ms.setActionHandler("stop", () => {
        close();
      });
    } catch {
      /* noop */
    }

    const seekStep = tvBrowser ? 15 : 10;
    if (!isLive) {
      try {
        ms.setActionHandler("seekbackward", () => seek(-seekStep));
        ms.setActionHandler("seekforward", () => seek(seekStep));
      } catch {
        /* noop */
      }
    }

    if (flipWithArrowKeys) {
      try {
        ms.setActionHandler("previoustrack", () => doFlip(-1));
        ms.setActionHandler("nexttrack", () => doFlip(1));
      } catch {
        /* noop */
      }
    }

    return () => {
      clearHandlers();
      ms.metadata = null;
      ms.playbackState = "none";
    };
  }, [
    open,
    current,
    isPlaying,
    isLive,
    flipWithArrowKeys,
    togglePlay,
    seek,
    close,
    doFlip,
    tvBrowser,
  ]);

  /**
   * Must stay synchronous for iOS: `webkitEnterFullscreen` only works inside an
   * uninterrupted user gesture — async/await before it breaks Brave/Safari.
   * Touch: handle pointerdown so the gesture isn’t “lost” before click on WKWebView.
   */
  const fullscreenGestureToggle = useCallback(() => {
    const el = containerRef.current;
    const v = videoRef.current as VideoWebKit | null;
    if (!el || !v) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }

    if (isFsRef.current) {
      if (typeof v.webkitExitFullscreen === "function") {
        try {
          v.webkitExitFullscreen();
        } catch {
          /* noop */
        }
        return;
      }
      if (typeof v.webkitSetPresentationMode === "function") {
        try {
          v.webkitSetPresentationMode("inline");
        } catch {
          /* noop */
        }
        return;
      }
    }

    if (isAppleMobileWebKitDevice()) {
      const supportsFs = v.webkitSupportsFullscreen !== false;
      if (
        supportsFs &&
        typeof v.webkitEnterFullscreen === "function"
      ) {
        try {
          v.webkitEnterFullscreen();
          return;
        } catch {
          /* fall through */
        }
      }
      if (typeof v.webkitSetPresentationMode === "function") {
        try {
          v.webkitSetPresentationMode("fullscreen");
          return;
        } catch {
          /* fall through */
        }
      }
    }

    // Always use the container div for DOM fullscreen — including TV/Silk
    // browsers. Using the <video> element puts the TV browser into its
    // native video-player UI which intercepts the hardware Back button
    // before our JavaScript ever sees it, making the page feel frozen.
    requestDomFullscreen(el);
    void Promise.resolve().then(() => {
      if (document.fullscreenElement || isFsRef.current) return;
      // Container fullscreen failed — try the video element as last resort.
      requestDomFullscreen(v);
      void Promise.resolve().then(() => {
        if (document.fullscreenElement || isFsRef.current) return;
        try {
          v.webkitEnterFullscreen?.();
        } catch {
          /* noop */
        }
      });
      });
  }, []);

  /**
   * WKWebView (Brave iOS): bind fullscreen on real `touchend` so the gesture chain stays intact.
   * Controls mount/unmount with `showControls` — deps must include it or the ref stays null.
   */
  useEffect(() => {
    if (!open || !showControls) return;
    const btn = fullscreenIosBtnRef.current;
    if (!btn || !isAppleMobileWebKitDevice()) return;
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      fullscreenTouchHandledRef.current = true;
      fullscreenGestureToggle();
      window.setTimeout(() => {
        fullscreenTouchHandledRef.current = false;
      }, 400);
    };
    btn.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    return () =>
      btn.removeEventListener("touchend", onTouchEnd, {
        capture: true,
      } as AddEventListenerOptions);
  }, [open, showControls, fullscreenGestureToggle]);

  const togglePip = useCallback(() => {
    void toggleVideoPictureInPicture(videoRef.current);
  }, []);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => setPipReady(false));
      return;
    }
    const v = videoRef.current;
    if (!v) return;

    const sync = () => {
      setPipReady(isPictureInPictureSupported(v) && v.readyState >= 1);
    };
    sync();
    const onEmptied = () => setPipReady(false);
    v.addEventListener("loadedmetadata", sync);
    v.addEventListener("loadeddata", sync);
    v.addEventListener("emptied", onEmptied);
    return () => {
      v.removeEventListener("loadedmetadata", sync);
      v.removeEventListener("loadeddata", sync);
      v.removeEventListener("emptied", onEmptied);
    };
  }, [open, current?.url, current?.id]);

  useEffect(() => {
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      isFsRef.current = fs;
      setIsFs(fs);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /** Exit any active fullscreen when the player overlay is closed. */
  useEffect(() => {
    if (open) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    const vid = videoRef.current as VideoWebKit | null;
    if (isFsRef.current && vid) {
      try { vid.webkitExitFullscreen?.(); } catch { /* noop */ }
      try {
        if (vid.webkitPresentationMode === "fullscreen") {
          vid.webkitSetPresentationMode?.("inline");
        }
      } catch { /* noop */ }
    }
  }, [open]);

  /** iPhone / iPad Safari & Brave: native video fullscreen — no document.fullscreenElement. */
  useEffect(() => {
    if (!open) return;
    const v = videoRef.current as VideoWebKit | null;
    if (!v) return;
    const onBegin = () => {
      isFsRef.current = true;
      setIsFs(true);
    };
    const onEnd = () => {
      isFsRef.current = false;
      setIsFs(false);
    };
    v.addEventListener("webkitbeginfullscreen", onBegin);
    v.addEventListener("webkitendfullscreen", onEnd);
    return () => {
      v.removeEventListener("webkitbeginfullscreen", onBegin);
      v.removeEventListener("webkitendfullscreen", onEnd);
    };
  }, [open, current?.url]);

  const switchLevel = (lvl: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    userTouchedHlsQualityRef.current = true;
    userChoseAutoHlsQualityRef.current = lvl === -1;
    hls.currentLevel = lvl;
    setCurrentLevel(lvl);
  };

  const switchSubtitle = (id: number) => {
    setActiveSubtitle(id);
    const hls = hlsRef.current;
    if (hls && subtitles.some((s) => s.source === "hls")) {
      hls.subtitleTrack = id;
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    Array.from(v.textTracks).forEach((t, i) => {
      t.mode = i === id ? "showing" : "disabled";
    });
  };

  const controlsHideDelayMs =
    tvBrowser || silkLikeClient ? 22_000 : 3000;

  const scheduleControlsHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (
        isPlayingRef.current &&
        !playerPanelsOpenRef.current
      ) {
        setShowControls(false);
      }
    }, controlsHideDelayMs);
  }, [controlsHideDelayMs]);

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

  // Auto-hide controls (longer on TV — remotes rarely trigger mousemove)
  const wakeControls = useCallback(() => {
    setShowControls(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  /** Windows Chrome/Brave: mousemove fires hundreds of times/sec — throttle UI wake. */
  const pointerWakeGateRef = useRef(0);
  const onPlayerPointerActivity = useCallback(() => {
    const now = performance.now();
    if (chromiumDesktopClient && now - pointerWakeGateRef.current < 500) {
      if (showControlsRef.current) scheduleControlsHide();
      return;
    }
    pointerWakeGateRef.current = now;
    wakeControls();
  }, [chromiumDesktopClient, scheduleControlsHide, wakeControls]);

  /** Series/movies often start playing after the first hide timer (loading, MKV probe). */
  useEffect(() => {
    if (!open || !isPlaying) return;
    scheduleControlsHide();
  }, [open, isPlaying, scheduleControlsHide]);

  const playerImmersive =
    isPlaying &&
    !showControls &&
    !showSettings &&
    !showSubs &&
    !showShare &&
    !showEpg;

  useEffect(() => {
    const root = document.documentElement;
    if (open && playerImmersive && (tvBrowser || silkLikeClient)) {
      root.classList.add("player-immersive");
      return () => root.classList.remove("player-immersive");
    }
    root.classList.remove("player-immersive");
    return undefined;
  }, [open, playerImmersive, tvBrowser, silkLikeClient]);

  const onVodGesturePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isLive) return;
      const v = videoRef.current;
      const strip = vodGestureStripRef.current;
      if (!v || !strip) return;
      const dur = getPlaybackDuration();
      if (!dur || !Number.isFinite(dur) || dur < 2) return;
      strip.setPointerCapture(e.pointerId);
      vodScrubPointerRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startTime: v.currentTime,
        moved: false,
      };
      wakeControls();
    },
    [isLive, wakeControls, getPlaybackDuration]
  );

  const onVodGesturePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = vodScrubPointerRef.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const v = videoRef.current;
      const strip = vodGestureStripRef.current;
      if (!v || !strip) return;
      const dur = getPlaybackDuration();
      if (!dur || !Number.isFinite(dur) || dur <= 0) return;
      const dx = e.clientX - s.startX;
      if (Math.abs(dx) > 10) s.moved = true;
      if (!s.moved) return;
      const w = strip.getBoundingClientRect().width || 1;
      const frac = dx / w;
      setTime(Math.max(0, Math.min(dur - 0.25, s.startTime + frac * dur)));
      wakeControls();
    },
    [wakeControls, getPlaybackDuration]
  );

  const onVodGesturePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = vodScrubPointerRef.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const strip = vodGestureStripRef.current;
      if (strip) {
        try {
          strip.releasePointerCapture(e.pointerId);
        } catch {
          /* not captured */
        }
      }
      if (s.moved) {
        const dur = getPlaybackDuration();
        if (dur && Number.isFinite(dur)) {
          const strip = vodGestureStripRef.current;
          const w = strip?.getBoundingClientRect().width || 1;
          const frac = (e.clientX - s.startX) / w;
          seekVideoTo(
            Math.max(0, Math.min(dur - 0.25, s.startTime + frac * dur))
          );
        }
      } else {
        togglePlay();
      }
      vodScrubPointerRef.current = null;
      wakeControls();
    },
    [togglePlay, wakeControls, getPlaybackDuration, seekVideoTo]
  );

  const onVodGesturePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = vodScrubPointerRef.current;
      if (!s || s.pointerId !== e.pointerId) return;
      vodScrubPointerRef.current = null;
      wakeControls();
    },
    [wakeControls]
  );

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => wakeControls());
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [open, wakeControls]);

  // Keyboard shortcuts (TV remotes: volume keys, channel keys, ↑/↓ volume when not flipping)
  useEffect(() => {
    if (!open) return;
    const seekStep = tvBrowser ? 15 : 10;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | undefined;
      if (target?.closest?.("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      // Escape OR TV Back button (Backspace / BrowserBack / GoBack):
      // exit fullscreen first, then close the player overlay.
      const isBackKey =
        e.key === "Escape" ||
        e.key === "Backspace" ||
        e.key === "BrowserBack" ||
        e.key === "GoBack";
      if (isBackKey) {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
          return;
        }
        const vid = videoRef.current as VideoWebKit | null;
        if (isFsRef.current && vid) {
          if (typeof vid.webkitExitFullscreen === "function") {
            try {
              vid.webkitExitFullscreen();
            } catch {
              /* noop */
            }
            return;
          }
          if (
            vid.webkitPresentationMode === "fullscreen" &&
            typeof vid.webkitSetPresentationMode === "function"
          ) {
            try {
              vid.webkitSetPresentationMode("inline");
            } catch {
              /* noop */
            }
            return;
          }
        }
        // Don't preventDefault for Backspace when not fullscreen — let the
        // browser handle history.back() naturally (TV hardware Back button).
        if (e.key === "Escape") {
          close();
        }
        return;
      }
      if (
        isPlayPauseShortcutKey(e.key) &&
        !isPlayerControlKeyboardTarget(e.target)
      ) {
        e.preventDefault();
        togglePlay();
      }

      if (livingRoomPlayback) {
        const k = e.key;
        if (
          k === "AudioVolumeUp" ||
          k === "AudioVolumeDown" ||
          k === "VolumeUp" ||
          k === "VolumeDown"
        ) {
          e.preventDefault();
          const v = videoRef.current;
          if (v) {
            const up = k === "AudioVolumeUp" || k === "VolumeUp";
            v.volume = Math.min(1, Math.max(0, v.volume + (up ? 0.08 : -0.08)));
            if (v.volume > 0) v.muted = false;
          }
          wakeControls();
          return;
        }
      }

      if (flipWithArrowKeys) {
        const zap = liveChannelFlipKeyDelta(e.key, e.keyCode);
        if (zap !== null) {
          e.preventDefault();
          doFlip(zap);
          wakeControls();
          return;
        }
      } else if (
        livingRoomPlayback &&
        (e.key === "ArrowUp" || e.key === "PageUp")
      ) {
        e.preventDefault();
        const v = videoRef.current;
        if (v) {
          v.volume = Math.min(1, v.volume + 0.08);
          if (v.volume > 0) v.muted = false;
        }
      } else if (
        livingRoomPlayback &&
        (e.key === "ArrowDown" || e.key === "PageDown")
      ) {
        e.preventDefault();
        const v = videoRef.current;
        if (v) {
          v.volume = Math.max(0, v.volume - 0.08);
        }
      } else if (e.key === "ArrowRight") {
        if (!isLive) {
          e.preventDefault();
          seek(seekStep);
        }
      } else if (e.key === "ArrowLeft") {
        if (!isLive) {
          e.preventDefault();
          seek(-seekStep);
        }
      }
      if (e.key.toLowerCase() === "m") setMute(!muted);
      if (e.key.toLowerCase() === "f") fullscreenGestureToggle();
      if (e.key.toLowerCase() === "p" && (pipReady || isPip)) togglePip();
      wakeControls();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    close,
    togglePlay,
    seek,
    setMute,
    muted,
    fullscreenGestureToggle,
    togglePip,
    pipReady,
    isPip,
    wakeControls,
    isLive,
    flipWithArrowKeys,
    doFlip,
    livingRoomPlayback,
  ]);

  /**
   * Hardware Back button on Android TV / Fire TV sends a popstate event
   * (browser navigates back in history) rather than a keydown.
   * When the player is open, intercept that navigation: exit fullscreen first,
   * then close the overlay, and push the state back so the URL is unchanged.
   */
  useEffect(() => {
    if (!open) return;
    // Push a sentinel history entry so the first Back press comes to us.
    window.history.pushState({ playerOpen: true }, "");
    const onPopState = () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
        // Re-push so a second Back press still closes the player.
        window.history.pushState({ playerOpen: true }, "");
        return;
      }
      const vid = videoRef.current as VideoWebKit | null;
      if (isFsRef.current && vid) {
        try { vid.webkitExitFullscreen?.(); } catch { /* noop */ }
        window.history.pushState({ playerOpen: true }, "");
        return;
      }
      close();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Clean up the sentinel history entry if we pushed it.
      if (window.history.state?.playerOpen) {
        window.history.back();
      }
    };
  }, [open, close]);

  const effectiveVodDuration =
    isLive || vodTotalSec <= 1
      ? isLive
        ? 0
        : duration > 1 && Number.isFinite(duration)
          ? duration
          : 0
      : vodTotalSec;

  const progress =
    effectiveVodDuration > 0 ? (time / effectiveVodDuration) * 100 : 0;
  const bufferedProgress =
    effectiveVodDuration > 0 ? (buffered / effectiveVodDuration) * 100 : 0;

  const qualityLabel = useMemo(() => {
    if (currentLevel === -1) return "Auto";
    const l = levels[currentLevel];
    if (!l) return "Auto";
    return hlsRenditionLabel(l, currentLevel);
  }, [currentLevel, levels]);

  const onCastStarted = useCallback(() => setShowShare(false), []);

  const { castSenderState, castActionMessage, cast } = usePlayerCast({
    open,
    showShare,
    silkLikeClient,
    castMedia,
    current,
    onCastStarted,
  });

  const copyDirectUrl = useCallback(async () => {
    if (!directUrl) return;
    try {
      await navigator.clipboard.writeText(directUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }, [directUrl]);

  const copyPageUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedPageUrl(true);
      setTimeout(() => setCopiedPageUrl(false), 1500);
    } catch {
      /* noop */
    }
  }, []);

  /** Live only: soft reload without closing the player (hls.js restarts load; native resets `<video src>`). */
  const reloadLiveStream = useCallback(() => {
    if (current?.kind !== "live") return;
    const el = videoRef.current;
    const url = withLiveHlsCompatMse(current.url, true);
    if (!el || !url) return;
    const hls = hlsRef.current;
    try {
      if (hls) {
        applySoftLiveHlsRecovery(hls, el, hlsLiveEdgeRestartGateRef);
        return;
      }
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.src = url;
      voidSafeVideoPlay(el);
    } catch {
      /* noop */
    }
  }, [current]);

  const chromiumPlaybackHint = useMemo(
    () => chromiumWalletExtensionPlaybackHint(),
    []
  );

  /**
   * Try again — live: soft hls.js reload first (one tap, keeps pipeline warm).
   * Second tap on the same channel does a full pipeline reset.
   */
  const recoverPlaybackFromError = useCallback(() => {
    livePlaybackRecoveryGenRef.current += 1;
    livePlaybackErrorSuppressUntilRef.current = performance.now() + 12_000;
    cancelLiveMediaErrorDeferRef.current();

    setError(null);
    streamSupportRequestIdRef.current = null;
    setStreamSupportRequestId(null);
    setStalled(false);
    setNeedsTapToPlay(false);
    setLoading(true);

    if (current?.kind === "live") {
      liveTryAgainStrikeRef.current += 1;
      const useFullReinit = liveTryAgainStrikeRef.current >= 2;
      const el = videoRef.current;
      const hls = hlsRef.current;
      if (!useFullReinit && hls && el) {
        try {
          applySoftLiveHlsRecovery(hls, el, hlsLiveEdgeRestartGateRef);
          playbackBreadcrumb("try_again_soft", { channelId: current.id });
          return;
        } catch {
          /* fall through to full reinit */
        }
      }
      playbackBreadcrumb("try_again_full", { channelId: current.id });
      liveTryAgainStrikeRef.current = 0;
      if (el) {
        try {
          el.pause();
          el.removeAttribute("src");
          el.load();
        } catch {
          /* noop */
        }
      }
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
          hlsRef.current.destroy();
        } catch {
          /* noop */
        }
        hlsRef.current = null;
      }
      userChoseAutoHlsQualityRef.current = false;
      userTouchedHlsQualityRef.current = false;
      setPlaybackRetryKey((k) => k + 1);
      return;
    }
    retryPlayback();
  }, [current, retryPlayback]);

  usePlayerStallEscalation({
    open,
    stalled,
    isLive,
    current,
    videoRef,
    onAutoRecover: recoverPlaybackFromError,
    setStalled,
    setLoading,
    setError,
    extensionHint: chromiumPlaybackHint,
  });

  // EPG: derive now-playing for live
  const nowEpg = useMemo(() => {
    const list = epgHeaderListings;
    const nowSec = Math.floor(clockMs / 1000);
    return (
      list.find((p) => {
        const r = epgProgramRangeUnixSec(p);
        return r !== null && r.start <= nowSec && r.end > nowSec;
      }) || list[0]
    );
  }, [epgHeaderListings, clockMs]);

  return (
    <AnimatePresence>
      {open && current && (
        <motion.div
          key="player"
          initial={
            quickVodPlayerOpen || mobileLikeViewport || chromiumDesktopClient
              ? false
              : { opacity: 0 }
          }
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration:
              quickVodPlayerOpen || mobileLikeViewport || chromiumDesktopClient
                ? 0
                : 0.18,
          }}
          className="fixed inset-0 z-[60] bg-black flex flex-col sm:flex-row items-stretch sm:items-center justify-center p-0 sm:p-6 min-h-0 touch-manipulation"
        >
          <motion.div
            initial={
              quickVodPlayerOpen || mobileLikeViewport || chromiumDesktopClient
                ? false
                : { scale: 0.96, y: 20 }
            }
            animate={{ scale: 1, y: 0 }}
            exit={
              quickVodPlayerOpen || mobileLikeViewport || chromiumDesktopClient
                ? undefined
                : { scale: 0.96, y: 20 }
            }
            transition={{
              duration:
                quickVodPlayerOpen || mobileLikeViewport || chromiumDesktopClient
                  ? 0
                  : 0.22,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            ref={containerRef}
            onMouseMove={onPlayerPointerActivity}
            onClick={onPlayerPointerActivity}
            className={cn(
              "relative isolate bg-black w-full max-w-[1400px] flex-1 min-h-0 sm:flex-none sm:aspect-video max-h-[100dvh] sm:max-h-[calc(100vh-3rem)] rounded-none sm:rounded-2xl overflow-hidden border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.7)]",
              "select-none",
              chromiumDesktopClient && "player-chromium-live-surface",
              playerImmersive && (tvBrowser || silkLikeClient) && "player-immersive-surface"
            )}
          >
            {isBraveOnAppleMobile() && !dismissBraveFullscreenBanner && (
              <div
                id="brave-ios-fullscreen-notice"
                className="absolute top-0 inset-x-0 z-[75] flex flex-wrap items-start gap-2 border-b border-amber-500/35 bg-amber-950/92 px-3 py-2.5 text-[13px] leading-snug text-amber-50/95 pointer-events-auto sm:text-sm"
              >
                <Info
                  className="size-4 shrink-0 text-amber-400 mt-0.5"
                  aria-hidden
                />
                <p className="min-w-0 flex-1">
                  Apple limits fullscreen video in Brave on iPhone — only Safari
                  gets the system fullscreen player here. Use{" "}
                  <strong className="text-white">Share → Open in Safari</strong>{" "}
                  for fullscreen, or paste the copied link into Safari.
                </p>
                <div className="flex shrink-0 items-center gap-1.5 self-center">
                  <button
                    type="button"
                    onClick={() => void copyPageUrl()}
                    className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                  >
                    {copiedPageUrl ? "Copied" : "Copy page link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissBraveFullscreenBanner(true)}
                    className="rounded-lg px-2 py-1.5 text-xs text-amber-200/90 hover:bg-white/10 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {showVodPrepare && posterSrc ? (
              <div
                className="absolute inset-0 z-[5] bg-cover bg-center scale-105"
                style={{ backgroundImage: `url("${posterSrc}")` }}
                aria-hidden
              />
            ) : null}

            <video
              ref={videoRef}
              poster={isLive || showVodPrepare ? undefined : posterSrc}
              playsInline
              preload={
                silkLikeClient ? "metadata" : isLive ? "auto" : "metadata"
              }
              autoPlay
              onClick={togglePlay}
              className={cn(
                "size-full max-h-[100dvh] object-contain bg-black",
                showVodPrepare && "opacity-0 transition-opacity duration-300",
                !showVodPrepare && "opacity-100",
                playerImmersive && (tvBrowser || silkLikeClient)
                  ? "cursor-none"
                  : "cursor-pointer"
              )}
            />

            <VodPrepareOverlay
              visible={showVodPrepare}
              title={current.title}
              subtitle={current.subtitle}
              poster={posterSrc}
              startedAtMs={vodPrepStartedAt}
              progress={vodPrepProgress}
            />

            {!isLive &&
              !error &&
              effectiveVodDuration > 2 && (
                <div
                  ref={vodGestureStripRef}
                  className="absolute bottom-0 left-0 right-0 z-[3] h-[30%] max-h-52 cursor-ew-resize touch-none select-none"
                  style={{ touchAction: "none" }}
                  aria-hidden
                  onPointerDown={onVodGesturePointerDown}
                  onPointerMove={onVodGesturePointerMove}
                  onPointerUp={onVodGesturePointerUp}
                  onPointerCancel={onVodGesturePointerCancel}
                  onLostPointerCapture={() => {
                    vodScrubPointerRef.current = null;
                  }}
                >
                  <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 max-w-[90%] text-center text-[10px] font-medium text-white/50 opacity-0 [@media(pointer:coarse)]:opacity-100">
                    Drag horizontally to seek
                  </span>
                </div>
              )}

            {/* Loading spinner (hidden during server-prep overlay) */}
            <AnimatePresence>
              {loading &&
                !showVodPrepare &&
                !error &&
                !needsTapToPlay &&
                !stalled && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0 grid place-items-center"
                >
                  <div className="size-12 border-2 border-white/20 border-t-(--brand-2) rounded-full animate-spin" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tap to play / unmute overlay */}
            {needsTapToPlay && !error && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const v = videoRef.current;
                  if (!v) return;
                  v.muted = false;
                  try {
                    await safeVideoPlay(v);
                    setNeedsTapToPlay(false);
                    setMuted(false);
                  } catch {
                    // Last resort: keep muted but force play
                    v.muted = true;
                    try {
                      await safeVideoPlay(v);
                    } catch {
                      /* noop */
                    }
                    setNeedsTapToPlay(false);
                    setMuted(true);
                  }
                }}
                className="absolute inset-0 grid place-items-center bg-black/55"
              >
                <div className="text-center px-6">
                  <div className="size-16 rounded-full btn-brand grid place-items-center mx-auto mb-3 shadow-[0_20px_60px_rgba(124,92,255,0.4)]">
                    <Play className="size-7 fill-white" />
                  </div>
                  <div className="text-white text-sm">
                    Tap to start with sound
                  </div>
                </div>
              </button>
            )}

            {stalled && !error && !showVodPrepare && (
              <PlayerStallOverlay
                isLive={isLive}
                vodTranscodeBoost={vodTranscodeBoost}
                extensionHint={chromiumPlaybackHint}
                copied={copied}
                hasDirectUrl={!!directUrl}
                onTryAgain={() => recoverPlaybackFromError()}
                onCopyUrl={() => void copyDirectUrl()}
              />
            )}

            {/* Safari / WebKit: audio decoding but no video surface (poster/HLS/compositor or audio-only variant). */}
            {liveAudioNoPicture && isLive && !error && (
              <div className="absolute inset-x-0 bottom-24 mx-auto max-w-lg px-4 z-[5]">
                <div className="glass rounded-xl px-4 py-3 text-center border border-amber-400/25">
                  <div className="text-amber-100 text-sm font-medium">
                    Hearing audio but no picture
                  </div>
                  <div className="text-white/75 text-xs mt-1 leading-snug">
                    Some IPTV feeds expose sound without a drawable video track in Safari
                    (channel poster quirks, HLS variants, or codecs WebKit won&apos;t paint).
                    Try Chrome or Edge, another browser, your provider&apos;s native app, or a
                    different listing for this channel if available.
                  </div>
                </div>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="absolute inset-0 grid place-items-center bg-black/70">
                <div className="max-w-md text-center px-6">
                  <div className="text-red-400 text-sm mb-2">
                    Unable to play
                  </div>
                  <div className="text-white/85 text-base">{error}</div>
                  {chromiumPlaybackHint ? (
                    <p className="text-white/55 text-xs mt-3 leading-snug">
                      {chromiumPlaybackHint}
                    </p>
                  ) : null}
                  {streamSupportRequestId ? (
                    <div className="text-white/45 text-xs mt-3 font-mono break-all">
                      Reference: {streamSupportRequestId}
                    </div>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    <button
                      onClick={() => recoverPlaybackFromError()}
                      className="px-4 py-2 rounded-lg btn-brand text-sm"
                    >
                      Try again
                    </button>
                    {directUrl ? (
                      <button
                        type="button"
                        onClick={() => void copyDirectUrl()}
                        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
                      >
                        {copied ? "Copied" : "Copy stream URL"}
                      </button>
                    ) : null}
                    <button
                      onClick={close}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Top bar */}
            <AnimatePresence>
              {showControls && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  data-player-controls=""
                  onKeyDown={swallowRemoteActivateKeys}
                  onPointerDown={swallowControlPointer}
                  onClick={swallowControlPointer}
                  className="absolute top-0 inset-x-0 z-[8] p-4 sm:p-5 bg-gradient-to-b from-black/80 to-transparent flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    {isLive && (
                      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-red-500/90 text-white mb-1.5">
                        <span className="size-1.5 rounded-full bg-white animate-pulse" />
                        Live
                      </div>
                    )}
                    <div className="text-white text-base sm:text-lg font-semibold truncate">
                      {current.title}
                    </div>
                    {isLive && nowEpg ? (
                      <div className="text-white/70 text-xs truncate">
                        Now: {decodeEpgText(nowEpg.title)}
                      </div>
                    ) : (
                      current.subtitle && (
                        <div className="text-white/60 text-xs truncate">
                          {current.subtitle}
                        </div>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {flipWithArrowKeys && (
                      <>
                        <button
                          type="button"
                          data-player-controls=""
                          onPointerUp={(e) => {
                            if (e.button !== 0) return;
                            activateFlipControl(e, () => doFlip(-1, true));
                          }}
                          onClick={(e) =>
                            activateFlipControl(e, () => doFlip(-1, true))
                          }
                          onKeyDown={(e) => {
                            if (!isRemoteActivateKey(e.key)) return;
                            activateFlipControl(e, () => doFlip(-1, true));
                          }}
                          aria-label={
                            playlist?.kind === "series"
                              ? "Previous episode"
                              : "Previous channel"
                          }
                          title={
                            playlist?.kind === "series"
                              ? "Previous episode (↑)"
                              : "Previous channel (↑)"
                          }
                          className={flipControlClass}
                        >
                          <ChevronUp
                            className={livingRoomPlayback ? "size-5" : "size-4"}
                          />
                        </button>
                        <button
                          type="button"
                          data-player-controls=""
                          onPointerUp={(e) => {
                            if (e.button !== 0) return;
                            activateFlipControl(e, () => doFlip(1, true));
                          }}
                          onClick={(e) =>
                            activateFlipControl(e, () => doFlip(1, true))
                          }
                          onKeyDown={(e) => {
                            if (!isRemoteActivateKey(e.key)) return;
                            activateFlipControl(e, () => doFlip(1, true));
                          }}
                          aria-label={
                            playlist?.kind === "series"
                              ? "Next episode"
                              : "Next channel"
                          }
                          title={
                            playlist?.kind === "series"
                              ? "Next episode (↓)"
                              : "Next channel (↓)"
                          }
                          className={flipControlClass}
                        >
                          <ChevronDown
                            className={livingRoomPlayback ? "size-5" : "size-4"}
                          />
                        </button>
                        <div className="w-px h-5 bg-white/15 mx-0.5 shrink-0" />
                      </>
                    )}
                    {(tvBrowser || silkLikeClient) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hideTimer.current) clearTimeout(hideTimer.current);
                          setShowSettings(false);
                          setShowSubs(false);
                          setShowShare(false);
                          setShowEpg(false);
                          setShowControls(false);
                        }}
                        aria-label="Hide playback controls"
                        title="Hide toolbar"
                        className="size-9 grid place-items-center rounded-lg bg-white/10 hover:bg-white/20 text-white"
                      >
                        <PanelBottomClose className="size-4" />
                      </button>
                    )}
                    <button
                      onClick={close}
                      aria-label="Close"
                      className="size-9 grid place-items-center rounded-lg bg-white/10 hover:bg-white/20 text-white"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Channel-flip overlay: brief peek of the just-switched channel */}
            <AnimatePresence>
              {flipPing > 0 && flipWithArrowKeys && current && (
                <motion.div
                  key={`flip-${flipPing}`}
                  initial={{ opacity: 0, scale: 0.92, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                  className="pointer-events-none absolute top-20 sm:top-24 left-1/2 -translate-x-1/2 z-20 max-w-[90%]"
                >
                  <div className="flex items-start gap-3 px-4 py-2.5 rounded-2xl bg-black/80 border border-white/15 shadow-xl">
                    <div className="text-[11px] font-mono text-white/60 tabular-nums shrink-0 pt-0.5">
                      {index + 1} / {playlist?.items.length}
                    </div>
                    <div className="w-px h-5 bg-white/15 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-white text-sm font-semibold truncate max-w-[60vw]">
                        {current.title}
                      </div>
                      {playlist?.kind === "series" && current.subtitle && (
                        <div className="text-white/75 text-xs truncate max-w-[60vw] mt-0.5">
                          {current.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* EPG drawer — code-split until user opens schedule */}
            <AnimatePresence>
              {showEpg && isLive && (
                <PlayerEpgDrawer
                  show={showEpg}
                  loading={epgScheduleLoading}
                  rows={epgDrawerRows}
                  clockMs={clockMs}
                  onClose={() => setShowEpg(false)}
                />
              )}
            </AnimatePresence>

            {/* Bottom controls */}
            <AnimatePresence>
              {showControls && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  data-player-controls=""
                  onKeyDown={swallowRemoteActivateKeys}
                  onPointerDown={swallowControlPointer}
                  onClick={swallowControlPointer}
                  className="absolute bottom-0 inset-x-0 z-[8] p-3 sm:p-5 bg-gradient-to-t from-black/85 to-transparent"
                >
                  {tvBrowser && (
                    <TvPlayerRemoteHints
                      flipWithArrowKeys={flipWithArrowKeys}
                      flipIsEpisodeList={playlist?.kind === "series"}
                      isLive={isLive}
                    />
                  )}
                  {/* Seek bar */}
                  {!isLive && (
                    <div className="relative group/scrub mb-3">
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-white/15 rounded-full overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-white/25"
                          style={{ width: `${bufferedProgress}%` }}
                        />
                        <div
                          className="absolute inset-y-0 left-0 bg-(--brand-2)"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={0.1}
                        value={progress}
                        onInput={onSeekInput}
                        onChange={onSeekCommit}
                        onPointerUp={onSeekCommit}
                        aria-label="Seek"
                        className="relative w-full appearance-none bg-transparent h-5 cursor-pointer
                                  [&::-webkit-slider-thumb]:appearance-none
                                  [&::-webkit-slider-thumb]:size-3.5
                                  [&::-webkit-slider-thumb]:rounded-full
                                  [&::-webkit-slider-thumb]:bg-white
                                  [&::-webkit-slider-thumb]:shadow-lg
                                  [&::-webkit-slider-thumb]:opacity-0
                                  group-hover/scrub:[&::-webkit-slider-thumb]:opacity-100
                                  [&::-webkit-slider-thumb]:transition-opacity"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 sm:gap-2 text-white">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                      }}
                      aria-label={isPlaying ? "Pause" : "Play"}
                      className="size-10 grid place-items-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="size-5 fill-white" />
                      ) : (
                        <Play className="size-5 fill-white" />
                      )}
                    </button>

                    {!isLive && (
                      <>
                        <button
                          type="button"
                          onClick={() => seek(-10)}
                          aria-label="Back 10 seconds"
                          className="grid size-9 place-items-center rounded-lg hover:bg-white/10"
                        >
                          <RotateCcw className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => seek(10)}
                          aria-label="Forward 10 seconds"
                          className="grid size-9 place-items-center rounded-lg hover:bg-white/10"
                        >
                          <RotateCw className="size-4" />
                        </button>
                      </>
                    )}

                    <div className="flex items-center gap-2 ml-1 group/vol">
                      <button
                        onClick={() => setMute(!muted)}
                        aria-label={muted ? "Unmute" : "Mute"}
                        className="size-9 grid place-items-center rounded-lg hover:bg-white/10"
                      >
                        {muted || volume === 0 ? (
                          <VolumeX className="size-4" />
                        ) : (
                          <Volume2 className="size-4" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={muted ? 0 : volume}
                        onChange={(e) => setVol(parseFloat(e.target.value))}
                        aria-label="Volume"
                        className="hidden sm:block w-0 group-hover/vol:w-24 transition-all duration-200 appearance-none h-1 rounded-full bg-white/15
                                   [&::-webkit-slider-thumb]:appearance-none
                                   [&::-webkit-slider-thumb]:size-3
                                   [&::-webkit-slider-thumb]:rounded-full
                                   [&::-webkit-slider-thumb]:bg-white
                                   accent-white"
                      />
                    </div>

                    <div className="ml-2 text-xs tabular-nums text-white/80">
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                          LIVE
                        </span>
                      ) : (
                        `${formatTime(time)} / ${formatTime(effectiveVodDuration)}`
                      )}
                    </div>

                    <div className="ml-auto flex items-center gap-1.5">
                      {/* EPG button (live only) */}
                      {isLive && (
                        <button
                          onClick={() => setShowEpg((s) => !s)}
                          aria-label="Schedule"
                          className={cn(
                            "size-9 hidden sm:grid place-items-center rounded-lg hover:bg-white/10",
                            showEpg && "bg-white/15"
                          )}
                        >
                          <CalendarClock className="size-4" />
                        </button>
                      )}

                      <PlayerControlMenus
                          hasSubtitles={subtitles.length > 0}
                          showSubs={showSubs}
                          setShowSubs={setShowSubs}
                          showSettings={showSettings}
                          setShowSettings={setShowSettings}
                          showShare={showShare}
                          setShowShare={setShowShare}
                          subtitles={subtitles}
                          activeSubtitle={activeSubtitle}
                          onSwitchSubtitle={switchSubtitle}
                          levels={levels}
                          currentLevel={currentLevel}
                          qualityLabel={qualityLabel}
                          onSwitchLevel={switchLevel}
                          castSenderState={castSenderState}
                          castMedia={castMedia}
                          onCast={() => void cast()}
                          castActionMessage={castActionMessage}
                          copied={copied}
                          onCopyDirectUrl={() => void copyDirectUrl()}
                          directUrl={directUrl}
                        />

                      <button
                        type="button"
                        onClick={togglePip}
                        disabled={!pipReady && !isPip}
                        aria-label="Picture in picture"
                        title={
                          pipReady || isPip
                            ? "Picture in picture"
                            : "Available once video has loaded"
                        }
                        className={cn(
                          "size-9 hidden sm:grid place-items-center rounded-lg hover:bg-white/10",
                          isPip && "bg-white/10",
                          !pipReady && !isPip && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        <PictureInPicture className="size-4" />
                      </button>

                      {isLive && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            reloadLiveStream();
                          }}
                          aria-label="Restart stream"
                          title="If playback freezes, reload the live buffer"
                          className="size-11 sm:size-9 grid lg:hidden place-items-center rounded-xl sm:rounded-lg hover:bg-white/10 min-h-[44px] min-w-[44px] text-white/90"
                        >
                          <RotateCcw className="size-4" />
                        </button>
                      )}

                      <button
                        ref={fullscreenIosBtnRef}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (fullscreenTouchHandledRef.current) {
                            fullscreenTouchHandledRef.current = false;
                            return;
                          }
                          fullscreenGestureToggle();
                        }}
                        onKeyDown={(e) => {
                          if (isRemoteActivateKey(e.key)) e.stopPropagation();
                        }}
                        aria-label="Fullscreen"
                        aria-describedby={
                          isBraveOnAppleMobile() &&
                          !dismissBraveFullscreenBanner
                            ? "brave-ios-fullscreen-notice"
                            : undefined
                        }
                        title={
                          isBraveOnAppleMobile()
                            ? "Fullscreen (open in Safari on iPhone)"
                            : "Fullscreen"
                        }
                        className="size-11 sm:size-9 grid place-items-center rounded-xl sm:rounded-lg hover:bg-white/10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                      >
                        {isFs ? (
                          <Minimize2 className="size-4" />
                        ) : (
                          <Maximize2 className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
