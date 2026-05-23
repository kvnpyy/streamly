"use client";

import { STREAM_PROXY_REQUEST_ID_HEADER } from "@/lib/request-id";
import { cn, formatTime } from "@/lib/utils";
import { useShortEPG, useFullEPG, decodeEpgText } from "@/lib/hooks";
import {
  type EpgListingLike,
  epgListingsHaveParsableTimes,
  epgProgramRangeUnixSec,
} from "@/lib/epg-time";
import { buildImageProxy } from "@/lib/xtream";
import { TvPlayerRemoteHints } from "@/components/TvPlayerRemoteHints";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { useAuth } from "@/store/auth";
import { usePlayer, type PlayerSource } from "@/store/player";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { AnimatePresence, motion } from "framer-motion";
import Hls, {
  type ErrorData,
  type Level,
  type MediaPlaylist,
} from "hls.js";
import {
  readPreferredPlayerVolume,
  writePreferredPlayerVolume,
} from "@/lib/player-volume-pref";
import { safeVideoPlay, voidSafeVideoPlay } from "@/lib/video-play";
import { isAmazonSilkUserAgent, isTvClassUserAgent } from "@/lib/tv-user-agent";
import {
  isPlayPauseShortcutKey,
  isPlayerControlKeyboardTarget,
  isRemoteActivateKey,
} from "@/lib/player-control-target";
import {
  Cast,
  CalendarClock,
  Captions,
  Check,
  ChevronUp,
  ChevronDown,
  Copy,
  ExternalLink,
  Info,
  Maximize2,
  Minimize2,
  PanelBottomClose,
  Pause,
  Play,
  PictureInPicture,
  RotateCcw,
  RotateCw,
  Settings2,
  Share2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * hls.js `startLoad(-1)` on live rewinds the buffer toward the sync target. When errors, stall
 * watchdogs, and `waiting` all call it in quick succession, panels look like they “loop” the same
 * slice forever. User-initiated reload passes `force`.
 */
const HLS_LIVE_EDGE_RESTART_MIN_MS = 4500;

function tryHlsLiveEdgeRestart(
  hls: Hls,
  lastAtMsRef: { current: number },
  force: boolean
): boolean {
  const now = Date.now();
  if (!force && now - lastAtMsRef.current < HLS_LIVE_EDGE_RESTART_MIN_MS) {
    return false;
  }
  lastAtMsRef.current = now;
  try {
    hls.startLoad(-1);
    return true;
  } catch {
    return false;
  }
}

type SubtitleTrack = {
  id: number; // -1 = off
  label: string;
  lang?: string;
  source: "hls" | "native";
};

/** Manifest hints across CODECS, rendition NAME, URI, supplemental codecs — panels often omit AC3 from `audioCodec` until load. */
function levelTelemetryBlob(level: Level): string {
  const a = level.attrs;
  const supplemental = a?.["SUPPLEMENTAL-CODECS"] ?? "";
  return [
    level.videoCodec ?? "",
    level.audioCodec ?? "",
    level.codecSet ?? "",
    level.codecs ?? "",
    level.name ?? "",
    level.uri ?? "",
    a?.CODECS ?? "",
    a?.AUDIO ?? "",
    supplemental,
  ]
    .join(" ")
    .toLowerCase();
}

/** User-facing rendition label when `height` is missing (avoids duplicate “Auto” rows on iOS). */
function hlsRenditionLabel(level: Level, index: number): string {
  const nm = (level.name ?? "").trim();
  if (nm) return nm;
  if (level.height) return `${level.height}p`;
  if (level.width) return `${Math.round(level.width)}p`;
  if (level.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`;
  return `Stream ${index + 1}`;
}

/** Chromium can't play AC-3/E-AC-3 over MSE; IPTV often starts on AAC then ABR bumps into AC-3 variants. */
function levelDeclaresDolbyDigital(level: Level): boolean {
  const blob = levelTelemetryBlob(level);
  return (
    blob.includes("ac-3") ||
    blob.includes("ac3") ||
    blob.includes("ec-3") ||
    blob.includes("ec3") ||
    blob.includes("eac3") ||
    blob.includes("dolby") ||
    blob.includes("atmos") ||
    blob.includes("ac-4") ||
    blob.includes("ac4")
  );
}

/** DTS* packaged audio is frequently unusable over Chromium MSE for IPTV (same class of failures as Dolby). */
function levelDeclaresDts(level: Level): boolean {
  const blob = levelTelemetryBlob(level);
  return (
    blob.includes("dts") ||
    blob.includes("dtsc") ||
    blob.includes("dtsh") ||
    blob.includes("dtsx")
  );
}

function levelDeclaresNonPreferredChromePackagedAudio(level: Level): boolean {
  return levelDeclaresDolbyDigital(level) || levelDeclaresDts(level);
}

/** Drop multivariant renditions that advertise DD/EAC3 when at least one rendition without them remains. */
function stripDolbyLevelsIfSaferAlternativesExist(
  hls: Pick<Hls, "levels" | "removeLevel">
) {
  const levels = hls.levels;
  if (!levels?.length || levels.length <= 1) return;

  const badIdx: number[] = [];
  levels.forEach((lv, i) => {
    if (levelDeclaresDolbyDigital(lv)) badIdx.push(i);
  });
  if (badIdx.length === 0 || badIdx.length >= levels.length) return;

  [...badIdx].sort((a, b) => b - a).forEach((i) => {
    if (hls.levels.length > 1) hls.removeLevel(i);
  });
}

/** Same pattern as Dolby — strip DTS-only variants when an AAC-friendly ladder remains. */
function stripDtsLevelsIfSaferAlternativesExist(
  hls: Pick<Hls, "levels" | "removeLevel">
) {
  const levels = hls.levels;
  if (!levels?.length || levels.length <= 1) return;

  const badIdx: number[] = [];
  levels.forEach((lv, i) => {
    if (levelDeclaresDts(lv)) badIdx.push(i);
  });
  if (badIdx.length === 0 || badIdx.length >= levels.length) return;

  [...badIdx].sort((a, b) => b - a).forEach((i) => {
    if (hls.levels.length > 1) hls.removeLevel(i);
  });
}

function levelDeclaresHevc(level: Level): boolean {
  const blob = levelTelemetryBlob(level);
  return (
    blob.includes("hevc") ||
    blob.includes("hvc1") ||
    blob.includes("hev1") ||
    blob.includes("h265") ||
    blob.includes("dvhe") ||
    blob.includes("dvh1") ||
    blob.includes("dovi")
  );
}

/** Fire TV / TV browsers often lack HEVC in MSE — drop HEVC ladders when an H.264 ladder remains. */
function stripHevcLevelsIfSaferAlternativesExist(
  hls: Pick<Hls, "levels" | "removeLevel">
) {
  const levels = hls.levels;
  if (!levels?.length || levels.length <= 1) return;

  const badIdx: number[] = [];
  levels.forEach((lv, i) => {
    if (levelDeclaresHevc(lv)) badIdx.push(i);
  });
  if (badIdx.length === 0 || badIdx.length >= levels.length) return;

  [...badIdx].sort((a, b) => b - a).forEach((i) => {
    if (hls.levels.length > 1) hls.removeLevel(i);
  });
}

/** Prefer the smallest safe rendition first so MSE gets a decodable variant before ABR climbs. */
function indexOfLowestSafeLevel(levels: Level[]): number {
  if (!levels?.length) return -1;
  let best = 0;
  let bestMetric = Infinity;
  levels.forEach((lv, i) => {
    if (
      levelDeclaresHevc(lv) ||
      levelDeclaresNonPreferredChromePackagedAudio(lv)
    )
      return;
    const h = lv.height || 0;
    const metric =
      h > 0 ? h : typeof lv.bitrate === "number" && lv.bitrate > 0 ? lv.bitrate / 1e6 : Infinity;
    if (metric < bestMetric) {
      bestMetric = metric;
      best = i;
    }
  });
  if (!Number.isFinite(bestMetric)) {
    return 0;
  }
  return best;
}

/** Highest ladder index that still avoids advertised HEVC/Dolby rungs — caps ABR when manifests lie or strips miss a variant. */
function maxSafeLevelIndex(levels: Level[]): number {
  if (!levels?.length) return -1;
  let max = -1;
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i];
    if (
      !levelDeclaresHevc(lv) &&
      !levelDeclaresNonPreferredChromePackagedAudio(lv)
    ) {
      max = i;
    }
  }
  return max;
}

/** After repeated fragment/level failures or stalls, cap ABR lower or drop the top ladder rung. */
function tryCapAbrLower(hls: Hls) {
  const levels = hls.levels;
  if (!levels?.length || levels.length <= 1) return;
  try {
    const capRaw = hls.autoLevelCapping;
    const cap =
      typeof capRaw === "number" && capRaw >= 0 ? capRaw : levels.length - 1;
    if (cap > 0) {
      hls.autoLevelCapping = cap - 1;
      if (!hls.autoLevelEnabled) {
        const cur = hls.currentLevel;
        if (typeof cur === "number" && cur > cap - 1) {
          hls.currentLevel = cap - 1;
        }
      }
      return;
    }
    const hi = levels.length - 1;
    if (hi > 0) hls.removeLevel(hi);
  } catch {
    /* noop */
  }
}

/** Prefer AAC/mp4a alternate audio when the manifest lists multiple EXT-X-MEDIA audio tracks. */
function preferBrowserFriendlyAudioTrack(hls: Pick<Hls, "audioTracks" | "audioTrack">) {
  const tracks = hls.audioTracks;
  if (!tracks?.length) return;

  const rank = (codec: string | undefined) => {
    const c = (codec ?? "").toLowerCase();
    if (c.includes("mp4a") || c.includes("aac")) return 0;
    if (c.includes("opus")) return 1;
    if (c.includes("ec-3") || c.includes("eac3") || c.includes("ac-3") || c.includes("ac3"))
      return 4;
    if (c.includes("dts")) return 4;
    return 2;
  };

  let best = 0;
  let bestR = rank(tracks[0].audioCodec);
  for (let i = 1; i < tracks.length; i++) {
    const r = rank(tracks[i].audioCodec);
    if (r < bestR) {
      bestR = r;
      best = i;
    }
  }

  try {
    hls.audioTrack = best;
  } catch {
    /* noop */
  }
}

/** Live is always treated as HLS. VOD may be HLS if the URL or proxied `u=` upstream ends with .m3u8. */
function playbackUrlIsHls(url: string, kindIsLive: boolean): boolean {
  if (kindIsLive) return true;
  if (url.includes("type=hls")) return true;
  if (/\.m3u8($|[?#])/i.test(url)) return true;
  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, origin);
    const upstream = parsed.searchParams.get("u");
    if (!upstream) return false;
    const decoded = decodeURIComponent(upstream);
    return /\.m3u8($|[?#])/i.test(decoded) || decoded.includes(".m3u8");
  } catch {
    return false;
  }
}

/** Stable key for persisted VOD resume (`accountKey|movie|streamId`). */
function vodResumeStorageKey(
  accountKey: string | undefined,
  current: PlayerSource | null
): string | null {
  if (!accountKey || !current || current.kind === "live") return null;
  const sid = current.streamId ?? current.id;
  return `${accountKey}|${current.kind}|${sid}`;
}

/**
 * Real iPhone/iPad WebKit, including:
 * - “Request Desktop Website” (UA looks like Mac + Safari, but multi‑touch).
 * - iPadOS reporting as MacIntel + touch.
 *
 * If this returns false on a phone, we may pick **hls.js** (MSE). On iOS, live sync + seeks
 * against a short native DVR window causes the same ~30s to repeat. So this must be broad.
 */
function isAppleMobileWebKitDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPod|iPad/.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  if (
    typeof document !== "undefined" &&
    "ontouchend" in document &&
    navigator.maxTouchPoints > 1 &&
    /Macintosh|Mac OS X/.test(ua)
  ) {
    return true;
  }
  return false;
}

/**
 * Brave on iPhone/iPad (WKWebView). Apple only wires reliable native video fullscreen to Safari;
 * third-party browsers often get a no-op from `webkitEnterFullscreen` / presentation mode.
 */
function isBraveOnAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!isAppleMobileWebKitDevice()) return false;
  return /\bBrave\b/i.test(navigator.userAgent || "");
}

/**
 * Safari (incl. macOS) and WKWebView that use AVFoundation for inline `application/vnd.apple.mpegurl`.
 * Excludes Chromium-class UAs so Mac Chrome/Edge/Brave still use the seek/hop path only when they
 * somehow hit native HLS (they normally use hls.js).
 */
function isSafariFamilyWithoutChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/\bChrom(?:e|ium)\b|\bEdg\//i.test(ua)) return false;
  if (/\bCriOS\b|\bFxiOS\b/i.test(ua)) return false;
  return /\bSafari\//i.test(ua);
}

const CAST_SENDER_SCRIPT_SRC =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

/**
 * Chromecast **Web Sender** only runs in Chromium-class desktop/Android browsers.
 * iOS browsers (incl. Chrome), Safari, and Firefox never get a working Cast framework here—avoid infinite “loading…”.
 */
function shouldAttemptChromecastSenderLoad(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isAppleMobileWebKitDevice()) return false;
  const ua = navigator.userAgent || "";
  if (/\bFirefox\b/i.test(ua)) return false;
  if (/\bSafari\b/i.test(ua) && !/\bChrom(?:e|ium)\b/i.test(ua)) return false;
  return (
    /\bChrom(?:e|ium)\//i.test(ua) ||
    /\bEdg\//i.test(ua) ||
    /\bOPR\//i.test(ua) ||
    /\bBrave\b/i.test(ua)
  );
}

/** Desktop Chromium-based browsers (Brave, Chrome, Edge, Opera, Arc…) — strict MSE codec limits vs Safari/Firefox. */
function isChromiumBasedDesktopBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|webOS|iPhone|iPad|iPod|Mobile\b/i.test(ua)) return false;
  const isFirefox = /\bFirefox\//.test(ua);
  const isSafariDesktop =
    /\bSafari\//.test(ua) &&
    !/\bChrome\//.test(ua) &&
    !/\bChromium\//.test(ua) &&
    !/\bEdg\//.test(ua);
  const isChromium =
    /\bChrome\//.test(ua) ||
    /\bChromium\//.test(ua) ||
    /\bEdg\//.test(ua) ||
    /\bBrave\//.test(ua) ||
    /\bOPR\//.test(ua);
  return isChromium && !isFirefox && !isSafariDesktop;
}

/** Shared hls.js tuning for all IPTV HLS (live + VOD) on Chromium/Firefox; live adds sync/edge options only. */
function buildIptvHlsJsConfig(opts: {
  isLive: boolean;
  mobileLike: boolean;
  livingRoomLike?: boolean;
  silkLike?: boolean;
}) {
  const { isLive, mobileLike, livingRoomLike = false, silkLike = false } = opts;
  const tightBuffers = mobileLike;

  const timeouts = silkLike ? 42_000 : 25_000;
  const manifestRetry = silkLike ? 10 : 8;
  const fragRetry = silkLike ? 20 : 14;

  /** Desktop/laptop live: deeper buffer + gentler live-sync so hours-long viewing survives jitter and CDN hiccups (vs Safari native direct play). */
  const marathonDesktopLive =
    isLive && !tightBuffers && !livingRoomLike && !silkLike;

  let maxBuf = tightBuffers ? 45 : 62;
  let maxMaxBuf = tightBuffers ? 220 : 480;
  let backBuf = tightBuffers ? 90 : 120;
  let abrUp = 0.55;
  let maxHoleLive = 0.55;
  let maxHoleVod = 0.45;

  if (marathonDesktopLive) {
    maxBuf = 120;
    maxMaxBuf = 720;
    backBuf = 180;
    /* Slower ABR uphill reduces jumps into alternate codecs on Brave / Chromium (PPV feeds often mis-declare rungs). */
    abrUp = Math.min(abrUp, 0.36);
    maxHoleLive = Math.max(maxHoleLive, 0.62);
  }

  if (livingRoomLike && tightBuffers) {
    maxBuf = 36;
    maxMaxBuf = 160;
    backBuf = 72;
    abrUp = 0.42;
    maxHoleLive = 0.72;
    maxHoleVod = 0.52;
  }

  if (silkLike && tightBuffers) {
    maxBuf = Math.min(maxBuf, 28);
    maxMaxBuf = Math.min(maxMaxBuf, 110);
    backBuf = Math.min(backBuf, 52);
    abrUp = Math.min(abrUp, 0.34);
    maxHoleLive = Math.min(maxHoleLive + 0.07, 0.82);
    maxHoleVod = Math.min(maxHoleVod + 0.07, 0.6);
  }

  let liveSyncCount = isLive
    ? livingRoomLike
      ? 8
      : marathonDesktopLive
        ? 14
        : tightBuffers
          ? 6
          : 5
    : 3;
  if (isLive && silkLike) liveSyncCount += 2;

  return {
    lowLatencyMode: false,
    /* Always cap live to `<video>` size so desktop ABR doesn’t sprint straight to max rungs (where providers often park HEVC / AC‑3). */
    capLevelToPlayerSize: isLive || livingRoomLike || silkLike,
    enableWorker: !isLive && !livingRoomLike && !silkLike,
    manifestLoadingTimeOut: timeouts,
    levelLoadingTimeOut: timeouts,
    fragLoadingTimeOut: timeouts,
    appendErrorMaxRetry: silkLike ? 6 : 4,
    useMediaCapabilities: false,
    abrBandWidthUpFactor: abrUp,
    backBufferLength: backBuf,
    maxBufferLength: maxBuf,
    maxMaxBufferLength: maxMaxBuf,
    maxBufferHole: isLive ? maxHoleLive : maxHoleVod,
    nudgeMaxRetry: silkLike ? 18 : 14,
    nudgeOffset: silkLike ? 0.14 : 0.12,
    highBufferWatchdogPeriod: silkLike ? 4.5 : 3,
    manifestLoadingMaxRetry: manifestRetry,
    levelLoadingMaxRetry: manifestRetry,
    fragLoadingMaxRetry: fragRetry,
    startFragPrefetch: !silkLike,
    liveSyncDurationCount: liveSyncCount,
    ...(silkLike ? { maxFragLookUpTolerance: 0.48 } : {}),
    ...(marathonDesktopLive ? { liveSyncMode: "buffered" as const } : {}),
    ...(isLive
      ? {
          liveDurationInfinity: true,
          maxLiveSyncPlaybackRate: marathonDesktopLive
            ? 1.03
            : silkLike && livingRoomLike
              ? 1.03
              : silkLike
                ? 1.04
                : livingRoomLike
                  ? 1.05
                  : tightBuffers
                    ? 1.06
                    : 1.08,
          liveSyncOnStallIncrease:
            marathonDesktopLive || silkLike || livingRoomLike ? 1 : 2,
          initialLiveManifestSize:
            marathonDesktopLive ? 4 : mobileLike || livingRoomLike || silkLike ? 2 : 3,
        }
      : {}),
  };
}

/**
 * iPhone/iPad **live** when `MediaSource` works: hls.js manages buffer/sync more predictably than
 * native `<video src>` for many IPTV feeds (fewer ~30s DVR / decoder freezes). Keep playback rate at 1.0
 * and stay farther from the live edge to reduce fight-with-manifest behavior.
 */
function buildAppleMobileLiveHlsConfig() {
  const base = buildIptvHlsJsConfig({ isLive: true, mobileLike: true });
  return {
    ...base,
    maxLiveSyncPlaybackRate: 1,
    liveSyncOnStallIncrease: 0,
    liveSyncDurationCount: 10,
    maxBufferLength: 52,
    maxMaxBufferLength: 200,
    backBufferLength: 100,
    maxBufferHole: 0.65,
    nudgeOffset: 0.08,
    nudgeMaxRetry: 12,
    initialLiveManifestSize: 3,
  };
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

/** Xtream `epg_listings` row (short + simpleDataTable). */
type PlayerEpgListing = EpgListingLike & {
  id: string | number;
  title?: string;
  description?: string;
};

type PlayerEpgScheduleRow = {
  id: string | number;
  startMs: number;
  endMs: number;
  title: string;
  description?: string;
};

function buildSortedEpgRows(listings: PlayerEpgListing[]): PlayerEpgScheduleRow[] {
  const out: PlayerEpgScheduleRow[] = [];
  for (const p of listings) {
    const range = epgProgramRangeUnixSec(p);
    if (!range) continue;
    out.push({
      id: p.id,
      startMs: range.start * 1000,
      endMs: range.end * 1000,
      title: typeof p.title === "string" ? p.title : "",
      description: typeof p.description === "string" ? p.description : undefined,
    });
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return out;
}

/** Virtualized schedule — avoids mounting hundreds of DOM nodes when full multi-day EPG loads. */
function PlayerScheduleVirtualList({
  drawerOpen,
  rows,
  clockMs,
}: {
  drawerOpen: boolean;
  rows: PlayerEpgScheduleRow[];
  clockMs: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const didScrollToNowRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 102,
    overscan: 12,
    measureElement:
      typeof document !== "undefined"
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  useEffect(() => {
    if (!drawerOpen) {
      didScrollToNowRef.current = false;
      return;
    }
    if (didScrollToNowRef.current || rows.length === 0) return;
    const idx = rows.findIndex(
      (r) => r.startMs <= clockMs && r.endMs > clockMs
    );
    const id = window.requestAnimationFrame(() => {
      if (idx >= 0) {
        virtualizer.scrollToIndex(idx, { align: "center" });
      }
      didScrollToNowRef.current = true;
    });
    return () => window.cancelAnimationFrame(id);
  }, [drawerOpen, rows, clockMs, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index]!;
          const onAir = row.startMs <= clockMs && row.endMs > clockMs;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-3"
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <div
                className={cn(
                  "rounded-xl p-3 border",
                  onAir
                    ? "border-(--brand)/50 bg-(--brand)/10"
                    : "border-white/10 bg-white/5"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-white/70 tabular-nums">
                    {new Date(row.startMs).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {new Date(row.endMs).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {onAir && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-(--brand)/40 text-white">
                      On air
                    </span>
                  )}
                </div>
                <div className="text-sm text-white mt-1 font-medium">
                  {decodeEpgText(row.title)}
                </div>
                {row.description ? (
                  <div className="text-xs text-white/60 mt-1 line-clamp-3">
                    {decodeEpgText(row.description)}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Wall clock for EPG “now” — driven from effects so render stays pure of Date.now(). */
function useTickingClockMs(intervalMs: number | null, resyncKey: unknown) {
  const [clockMs, setClockMs] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- timer-driven wall clock for EPG boundaries
    setClockMs(Date.now());
  }, [resyncKey]);

  useEffect(() => {
    if (intervalMs == null) return;
    const iv = setInterval(() => {
      setClockMs(Date.now());
    }, intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);

  return clockMs;
}

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void;
    cast?: {
      framework: {
        CastContext: {
          getInstance: () => {
            setOptions: (o: unknown) => void;
            requestSession: () => Promise<unknown>;
          };
        };
        CastContextEventType: { CAST_STATE_CHANGED: string };
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

export function PlayerOverlay() {
  const { current, open, close, flip, playlist, index } = usePlayer();
  const tvBrowser = useTvBrowser();
  const silkLikeClient = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return isAmazonSilkUserAgent(navigator.userAgent || "");
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
  const hlsRef = useRef<Hls | null>(null);
  /** Throttles automatic `startLoad(-1)` storms on live HLS (see `tryHlsLiveEdgeRestart`). */
  const hlsLiveEdgeRestartGateRef = useRef(0);
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Latest `/api/stream` correlation id (frag/manifest XHR or VOD probe); shown on fatal playback errors for support. */
  const [streamSupportRequestId, setStreamSupportRequestId] = useState<
    string | null
  >(null);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [stalled, setStalled] = useState(false);
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
  /** Live: Safari sometimes decodes audio but paints no picture (poster glitch, audio-only variant, or codec/compositor edge case). */
  const [liveAudioNoPicture, setLiveAudioNoPicture] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeFetchRef = useRef<AbortController | null>(null);
  const fragLoadDowngradeRef = useRef(0);
  const flipOverlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flipPing, setFlipPing] = useState(0);

  const doFlip = useCallback(
    (delta: number) => {
      if (!canFlip) return;
      flip(delta);
      setFlipPing((n) => n + 1);
      if (flipOverlayTimer.current) clearTimeout(flipOverlayTimer.current);
      flipOverlayTimer.current = setTimeout(() => setFlipPing(0), 1400);
    },
    [canFlip, flip]
  );

  const isLive = current?.kind === "live";
  const creds = useAuth((s) => s.creds);
  const liveStreamId = isLive ? current?.id : undefined;
  /** Header “Now:” only needs a small window — avoids giant parallel fetch while watching. */
  const epgShort = useShortEPG(liveStreamId, 24);
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
    open && isLive ? 60_000 : null,
    open && isLive ? epgHeaderListings : null
  );

  // Build the upstream (direct, non-proxied) URL for casting/share
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

  /** Same-origin poster via /api/img — avoids CORS when panel logos are raw http(s) URLs. */
  const posterSrc = useMemo(
    () => (current?.poster ? buildImageProxy(current.poster) : undefined),
    [current]
  );

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // iOS / older WebKit: redundant playsinline attrs avoid fullscreen-only decode paths.
  useEffect(() => {
    if (!open || !current) return;
    const v = videoRef.current;
    if (!v) return;
    v.setAttribute("playsinline", "true");
    v.setAttribute("webkit-playsinline", "true");
  }, [open, current]);

  // Setup video element + HLS pipeline
  useEffect(() => {
    if (!open || !current) return;
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    setStreamSupportRequestId(null);
    setNeedsTapToPlay(false);
    setStalled(false);
    setLoading(true);
    setTime(0);
    setDuration(0);
    setLevels([]);
    setCurrentLevel(-1);
    setSubtitles([]);
    setActiveSubtitle(-1);
    setLiveAudioNoPicture(false);
    userChoseAutoHlsQualityRef.current = false;
    userTouchedHlsQualityRef.current = false;

    let cancelled = false;
    fragLoadDowngradeRef.current = 0;
    probeFetchRef.current?.abort();
    probeFetchRef.current = new AbortController();
    const probeSignal = probeFetchRef.current.signal;
    const url = current.url;

    const preferredVol = readPreferredPlayerVolume();
    if (preferredVol != null) {
      video.volume = preferredVol;
      queueMicrotask(() => setVolume(preferredVol));
    }

    const cleanupHls = () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
        } catch {
          /* noop */
        }
        try {
          hlsRef.current.destroy();
        } catch {
          /* noop */
        }
        hlsRef.current = null;
      }
    };

    cleanupHls();
    hlsLiveEdgeRestartGateRef.current = 0;

    const tryAutoplay = async () => {
      if (cancelled) return;
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
    const useNativeAppleHls =
      isHls && (canNativeHls || isAppleMobileWebKitDevice());

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
      Hls.isSupported();

    const livingRoomLike =
      typeof navigator !== "undefined" &&
      isTvClassUserAgent(navigator.userAgent || "");

    const silkLike =
      typeof navigator !== "undefined" &&
      isAmazonSilkUserAgent(navigator.userAgent || "");

    const mobileLike =
      typeof window !== "undefined" &&
      (livingRoomLike ||
        silkLike ||
        window.matchMedia("(max-width: 640px)").matches ||
        window.matchMedia("(pointer: coarse)").matches);

    const unsupportedBrowserAudioMsg = livingRoomLike || silkLike
      ? "This channel’s audio (often AC-3/E-AC-3) isn’t supported in the Amazon Silk / TV browser player. Try another channel, use Chromecast, or watch with a native IPTV app on the same device if available."
      : "This channel uses audio (often AC-3/EAC-3) that Chromium-based browsers cannot decode in a web player. Try Safari on Mac or iPhone, your provider's native app, or Chromecast.";

    const isLikelyUnsupportedAudioCodecError = (data: ErrorData): boolean => {
      const d = data.details;
      return (
        d === Hls.ErrorDetails.BUFFER_ADD_CODEC_ERROR ||
        d === Hls.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR ||
        d === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR ||
        (d === Hls.ErrorDetails.BUFFER_APPEND_ERROR &&
          data.sourceBufferName === "audio")
      );
    };

    /** VOD only: Range probe before assigning src (live skips). Returns false if probe failed hard. */
    const probeVodThenPlayNative = async (): Promise<boolean> => {
      if (!isLive) {
        try {
          const probe = await fetch(url, {
            method: "GET",
            headers: { Range: "bytes=0-0" },
            cache: "no-store",
            signal: probeSignal,
          });
          if (cancelled) return false;
          const rid = probe.headers.get(STREAM_PROXY_REQUEST_ID_HEADER);
          if (rid) setStreamSupportRequestId(rid);
          if (probe.status === 404 || probe.status === 410) {
            setError("This episode isn't available from your provider.");
            setLoading(false);
            return false;
          }
          if (probe.status >= 400) {
            setError(
              probe.status === 403
                ? "Your provider blocked this request. Try another episode or try again later."
                : `Provider returned ${probe.status}. The file may be offline or temporarily unavailable.`
            );
            setLoading(false);
            return false;
          }
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
      Hls.isSupported() &&
      (!isAppleMobileWebKitDevice() || isLive)
    ) {
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

      /**
       * Live playlists refresh and ABR climbs — re-apply filters so we don't drift into HEVC/Dolby variants Chromium can't decode over MSE.
       * Desktop Chromium: pin lowest-safe **once on MANIFEST_PARSED only** — repeating `currentLevel=` on every `MANIFEST_LOADED`/recovery thrashed MSE and produced bogus codec errors.
       */
      const stabilizeBrowserFriendlyCodecs = (opts?: {
        pinChromiumLowQuality?: boolean;
      }) => {
        if (cancelled) return;
        stripHevcLevelsIfSaferAlternativesExist(hls);
        stripDolbyLevelsIfSaferAlternativesExist(hls);
        stripDtsLevelsIfSaferAlternativesExist(hls);
        preferBrowserFriendlyAudioTrack(hls);

        const desktopMseLiveTune =
          isLive &&
          !livingRoomLike &&
          !silkLike &&
          !appleMobileLiveMse &&
          hls.levels?.length;

        if (desktopMseLiveTune) {
          try {
            const maxSafe = maxSafeLevelIndex(hls.levels);
            if (maxSafe >= 0) {
              hls.autoLevelCapping = maxSafe;
            }
          } catch {
            /* noop */
          }
        }

        if (
          opts?.pinChromiumLowQuality &&
          chromiumLiveQualityLockEligible &&
          hls.levels?.length &&
          !userChoseAutoHlsQualityRef.current &&
          !userTouchedHlsQualityRef.current
        ) {
          try {
            const low = indexOfLowestSafeLevel(hls.levels);
            if (low >= 0 && hls.manualLevel !== low) {
              hls.currentLevel = low;
              setCurrentLevel(low);
            }
          } catch {
            /* noop */
          }
        }

        if ((livingRoomLike || silkLike) && hls.levels?.length) {
          try {
            const startIdx = indexOfLowestSafeLevel(hls.levels);
            if (startIdx >= 0) {
              hls.startLevel = startIdx;
            }
          } catch {
            /* noop */
          }
        }
      };

      const baseHlsConfig = appleMobileLiveMse
        ? buildAppleMobileLiveHlsConfig()
        : buildIptvHlsJsConfig({ isLive, mobileLike, livingRoomLike, silkLike });
      const hlsConfig = {
        ...baseHlsConfig,
        xhrSetup(xhr: XMLHttpRequest, reqUrl: string) {
          if (!reqUrl.includes("/api/stream")) return;
          xhr.addEventListener("load", function onLoad() {
            xhr.removeEventListener("load", onLoad);
            if (cancelled) return;
            const rid = xhr.getResponseHeader(STREAM_PROXY_REQUEST_ID_HEADER);
            if (rid) setStreamSupportRequestId(rid);
          });
        },
      };
      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);

      /** Fatal `NETWORK_ERROR` streak — reset whenever data actually flows (Safari otherwise accumulates transient fatals). */
      let consecutiveNetworkErrors = 0;
      const resetNetErrStreak = () => {
        consecutiveNetworkErrors = 0;
      };

      /** Intentionally no periodic `startLoad(-1)` — it fights hls.js live playlist refresh and causes visible black/rebuffer loops on many panels. */

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        resetNetErrStreak();
        stabilizeBrowserFriendlyCodecs({ pinChromiumLowQuality: true });
        setLevels(hls.levels);
        if (userChoseAutoHlsQualityRef.current) {
          setCurrentLevel(-1);
        } else if (!chromiumLiveQualityLockEligible) {
          setCurrentLevel(-1);
        }
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
        preferBrowserFriendlyAudioTrack(hls);
      });

      /** Master manifest refresh (common on live IPTV) can append new renditions after playback starts. */
      hls.on(Hls.Events.MANIFEST_LOADED, () => {
        if (cancelled) return;
        resetNetErrStreak();
        if (!isLive) return;
        stabilizeBrowserFriendlyCodecs();
        setLevels(hls.levels);
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
        if (cancelled) return;
        preferBrowserFriendlyAudioTrack(hls);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (!cancelled) setCurrentLevel(hls.autoLevelEnabled ? -1 : data.level);
        preferBrowserFriendlyAudioTrack(hls);
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
              hls.currentLevel = safeIdx;
            } catch {
              /* noop */
            }
          }
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, resetNetErrStreak);
      hls.on(Hls.Events.LEVEL_LOADED, resetNetErrStreak);

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) {
          // BUFFER_APPEND_ERROR fires in tight loops on bad audio tracks — recover once before fatal MEDIA_ERROR.
          if (data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR) {
            const audioBuf =
              data.sourceBufferName === "audio" ||
              data.sourceBufferName === "audiovideo";
            // Never call full stabilize here — stripping levels + re-pinning quality mid-playback caused transient MEDIA_ERROR; Try again only ran startLoad().
            if (isLive && audioBuf && audioAppendRecoveryAttempts < 3) {
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
              try {
                hls.startLoad(-1);
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
          // Let hls.js handle stalls/nudges internally — redundant `startLoad(-1)` often flashes black / resets buffer.
          if (isLive) {
            const bumpReload = bumpDetails.includes(data.details);
            if (bumpReload) {
              tryHlsLiveEdgeRestart(
                hls,
                hlsLiveEdgeRestartGateRef,
                false
              );
            }
          } else if (fragish) {
            try {
              hls.startLoad(-1);
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
          case Hls.ErrorTypes.NETWORK_ERROR:
            consecutiveNetworkErrors += 1;
            {
              const touchyClient =
                mobileLike || isAppleMobileWebKitDevice();
              const maxFatalNet = touchyClient
                ? isLive
                  ? 22
                  : 14
                : isLive
                  ? 7
                  : 8;
              if (consecutiveNetworkErrors >= maxFatalNet) {
                setError(
                  "Couldn't reach this stream. The channel may be offline or your provider blocked the request."
                );
                cleanupHls();
              } else {
                hls.startLoad();
              }
            }
            break;
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
              setError(unsupportedBrowserAudioMsg);
              cleanupHls();
              break;
            }
            if (mediaRecoverAttempts >= (isLive ? 4 : 2)) {
              setError(
                "Playback failed after repeated media errors. This stream may use unsupported audio/video in your browser."
              );
              cleanupHls();
              break;
            }
            mediaRecoverAttempts += 1;
            try {
              hls.recoverMediaError();
            } catch {
              setError(
                "Media error: this stream isn't playable in the browser."
              );
              cleanupHls();
            }
            break;
          default:
            setError("Playback failed. Try a different channel.");
            cleanupHls();
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
    const stallMs = vodProgressivePlayback
      ? 26_000
      : silkLike
        ? 18_000
        : 12_000;
    stallTimer.current = setTimeout(() => {
      if (cancelled) return;
      const v = videoRef.current;
      if (!v) return;
      const hasBuffer = v.buffered.length > 0 && v.buffered.end(0) > 0.1;
      if (!hasBuffer && !v.error) {
        setStalled(true);
      }
    }, stallMs);

    return () => {
      if (video && creds && current && current.kind !== "live") {
        const key = vodResumeStorageKey(browseAccountKey(creds), current);
        const t = video.currentTime;
        const d = video.duration;
        if (key && t > 12 && d && Number.isFinite(d) && t < d - 45) {
          usePrefs.getState().saveVodResume(key, t);
        }
      }
      cancelled = true;
      probeFetchRef.current?.abort();
      if (stallTimer.current) clearTimeout(stallTimer.current);
      cleanupHls();
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        /* noop */
      }
    };
  }, [open, current, isLive, creds]);

  /** VOD: resume + periodic save of playback position. */
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
      const d = video.duration;
      if (!d || !Number.isFinite(d) || d < 30) return;
      if (target >= d - 25) return;
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
      const d = video.duration;
      if (!d || !Number.isFinite(d) || t < 12 || t > d - 45 || t - lastPersist < 7)
        return;
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
  }, [open, current, isLive, creds]);

  /** After several `waiting` events, cap ABR / drop top ladder rung (hls.js paths). */
  useEffect(() => {
    if (!open || !current) return;
    /** iOS Safari + hls.js: `waiting` fires often at the live edge; `startLoad(-1)` here caused fatal NETWORK_ERROR loops ~1min in. */
    if (isAppleMobileWebKitDevice()) return;
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
      tryHlsLiveEdgeRestart(h, hlsLiveEdgeRestartGateRef, false);
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
  }, [open, current]);

  /** Warm playlist neighbors so channel flips reuse hot TLS/CDN connections (manifest is small). */
  useEffect(() => {
    if (!open || !playlist || playlist.items.length < 2 || index < 0) return;
    if (silkLikeClient) return;
    const items = playlist.items;
    const n = items.length;
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
  }, [open, playlist, index, current?.url, silkLikeClient]);

  /**
   * Live native HLS can wedge after long runs; refreshing when returning to the tab often matches
   * “flip channel” recovery. Skip on iPhone/iPad native — visibility flicker + reload replays the
   * short DVR window and looks like a loop.
   */
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
        const u = current.url;
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
  }, [open, current]);

  // Video event listeners
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
    /** Throttle React state from `timeupdate` on phones — many setState/s hurt WebKit during live IPTV. */
    let lastAppleMobileUiFlush = 0;

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

    /** Chromium (hls.js): restart loading. Safari/WebKit (native HLS): nudge toward live edge — was missing before. */
    const kickLivePlayback = () => {
      const vv = videoRef.current;
      if (!vv || vv.paused || vv.error) return;
      const hls = hlsRef.current;
      if (hls) {
        try {
          /**
           * Live MSE: do not micro-seek inside `buffered` here — hls.js live sync immediately pulls
           * `currentTime` back toward the playlist edge, which users describe as playing forward a
           * few seconds then snapping back. Prefer a throttled `startLoad(-1)` only.
           */
          if (
            tryHlsLiveEdgeRestart(hls, hlsLiveEdgeRestartGateRef, false)
          ) {
            voidSafeVideoPlay(vv);
          }
        } catch {
          try {
            hls.recoverMediaError();
          } catch {
            /* noop */
          }
        }
        return;
      }
      /**
       * Native WebKit HLS (iPhone **and** Safari on Mac): seek-to-live-edge + buffer micro-seeks
       * fight AVFoundation’s sliding timeline on IPTV — same snap-back and short-loop reports as
       * the ~30s iPhone DVR case. Only nudge `play()`; `reloadNativeLiveSource` still exists after
       * repeated stall kicks.
       */
      if (
        isAppleMobileWebKitDevice() ||
        isSafariFamilyWithoutChromium()
      ) {
        voidSafeVideoPlay(vv);
        return;
      }
      try {
        if (vv.seekable?.length) {
          const idx = vv.seekable.length - 1;
          const end = vv.seekable.end(idx);
          const start = vv.seekable.start(idx);
          if (Number.isFinite(end) && end > start + 0.25) {
            const target = Math.min(Math.max(end - 3.5, start + 0.05), end - 0.1);
            if (target > vv.currentTime + 0.12) {
              vv.currentTime = target;
              voidSafeVideoPlay(vv);
              return;
            }
          }
        }
      } catch {
        /* seek on live can throw */
      }
      try {
        if (vv.buffered.length > 0) {
          const end = vv.buffered.end(vv.buffered.length - 1);
          const ahead = end - vv.currentTime;
          if (ahead >= 0 && ahead < 2.8) {
            const hop = Math.min(end - 0.08, vv.currentTime + Math.max(0.35, ahead * 0.65));
            if (hop > vv.currentTime && hop <= end) {
              vv.currentTime = hop;
              voidSafeVideoPlay(vv);
              return;
            }
          }
        }
      } catch {
        /* noop */
      }
      voidSafeVideoPlay(vv);
    };

    const reloadNativeLiveSource = () => {
      const vv = videoRef.current;
      const url = current?.url;
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

    const kickLiveIfBufferLow = () => {
      const vv = videoRef.current;
      if (!vv) return;
      const ahead =
        vv.buffered.length > 0
          ? vv.buffered.end(vv.buffered.length - 1) - vv.currentTime
          : 0;
      const threshold = hlsRef.current ? 2.4 : 4.5;
      if (ahead < threshold) kickLivePlayback();
    };

    const stripPosterForWebKit = () => {
      try {
        v.removeAttribute("poster");
      } catch {
        /* noop */
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      setLoading(false);
      setNeedsTapToPlay(false);
      setStalled(false);
      stripPosterForWebKit();
      if (v.videoWidth > 0) setLiveAudioNoPicture(false);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => {
      setLoading(true);
      if (!isLiveStream) return;
      /** Native iOS: no seek-kicks, no `waiting`→reload (normal rebuffering would interrupt constantly). */
      if (!hlsRef.current && isAppleMobileWebKitDevice()) return;
      cancelLiveKickTimer();
      liveKickTimer = setTimeout(() => {
        liveKickTimer = null;
        kickLiveIfBufferLow();
      }, 2600);
    };
    const onPlaying = () => {
      setLoading(false);
      setStalled(false);
      stripPosterForWebKit();
      if (v.videoWidth > 0) setLiveAudioNoPicture(false);
      cancelLiveKickTimer();
      cancelLiveMediaErrorDefer();
      if (isLiveStream) {
        liveProgress.lastCt = -1;
        liveProgress.stuckSince = 0;
      }
    };
    const onTime = () => {
      const nativeAppleLive =
        isLiveStream &&
        !hlsRef.current &&
        isAppleMobileWebKitDevice();

      const flushUi = () => {
        setTime(v.currentTime);
        const buf = v.buffered;
        if (buf.length) setBuffered(buf.end(buf.length - 1));
      };
      if (isAppleMobileWebKitDevice() && isLiveStream) {
        const nowMs = performance.now();
        if (nowMs - lastAppleMobileUiFlush >= 280) {
          lastAppleMobileUiFlush = nowMs;
          flushUi();
        }
      } else {
        flushUi();
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
      } else if (v.videoWidth > 0) {
        setLiveAudioNoPicture(false);
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
        const lowAheadKick =
          hlsRef.current != null ? ahead < 0.48 : ahead < 1.05;
        const lowKickCooldownMs = hlsRef.current != null ? 9000 : 4200;
        if (
          lowAheadKick &&
          nowMs - lastLowBufferKick > lowKickCooldownMs
        ) {
          lastLowBufferKick = nowMs;
          kickLivePlayback();
        }
      }

      if (!isLiveStream || v.paused) return;
      if (nativeAppleLive) return;

      const ct = v.currentTime;
      const now = performance.now();
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
      const stuckThresholdMs =
        hlsRef.current != null ? 16_000 : isAppleMobileWebKitDevice() ? 3800 : 6500;
      if (now - liveProgress.stuckSince > stuckThresholdMs) {
        liveProgress.stuckSince = now;
        liveProgress.lastCt = ct;
        nativeStallKicks += 1;
        kickLivePlayback();
        if (!hlsRef.current && nativeStallKicks >= 5) {
          nativeStallKicks = 0;
          reloadNativeLiveSource();
        }
      }
    };
    const onMeta = () => {
      setDuration(v.duration);
      if (v.videoWidth > 0) setLiveAudioNoPicture(false);
    };

    const onLoadedData = () => {
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
      const liveAppleNativeWebKit =
        current?.kind === "live" &&
        isAppleMobileWebKitDevice() &&
        !hlsRef.current;
      const liveMidPlayHint =
        current?.kind === "live"
          ? liveAppleNativeWebKit
            ? " iPhone Safari still uses WebKit for this page—some feeds are HEVC-only, use odd audio layouts, or work only in a native IPTV/VLC app."
            : " Common when the feed bumps to Dolby or HEVC—Brave and Chrome only handle AAC plus H.264 reliably over MSE here. Use Try again below, Chromecast, or your provider's app."
          : "";
      const braveIosVodHint =
        " On iPhone, Safari and Brave share the same in-page limits for many MKV/HEVC/Dolby files—VLC/Infuse or your provider's app is the reliable path.";
      const map: Record<number, string> = {
        1: "Playback was aborted.",
        2: "Network error fetching the stream.",
        3: vodProgressive
          ? braveIosVod
            ? `This movie or episode uses codecs or a container mobile browsers can't play in-page (very common with MKV, or MP4 with HEVC/AC‑3).${braveIosVodHint} Or copy the stream link from Share → open in VLC.`
            : "This episode or movie uses codecs or a container in-browser players can't decode (common with MKV, HEVC, or DTS from Xtream). Safari and Brave share many of the same limits—try your provider's native app, VLC/TiviMate, or another encode labeled MP4 / H.264 / AAC if available."
          : `The stream is corrupt or in an unsupported codec.${liveMidPlayHint}`,
        4: vodProgressive
          ? braveIosVod
            ? `The file format isn't playable here (often MKV, or MP4 with codecs WebKit won't decode).${braveIosVodHint}`
            : "The file uses a format or codec this web player can't play (often MKV or HEVC). That usually isn't a bug: desktop browsers often can't handle what IPTV apps stream fine. Use a native IPTV player or VLC, or pick an MP4 release if your provider lists one."
          : `This stream uses a format or codec your browser can't play here (common on some PPV / event feeds). Try Chromecast, Safari, or your provider's native app.${liveMidPlayHint}`,
      };

      const hlsNow = hlsRef.current;
      /** Same recovery as Try again — transient MSE hiccups clear without nuking UX if we defer surfacing codec errors. */
      if (
        isLiveStream &&
        hlsNow &&
        (code === 3 || code === 4)
      ) {
        cancelLiveMediaErrorDefer();
        tryHlsLiveEdgeRestart(
          hlsNow,
          hlsLiveEdgeRestartGateRef,
          false
        );
        voidSafeVideoPlay(v);
        const persistedCode = code;
        liveMediaErrorDeferTimer = window.setTimeout(() => {
          liveMediaErrorDeferTimer = null;
          const vv = videoRef.current;
          if (!vv?.error || vv.error.code !== persistedCode) return;
          setError(map[persistedCode] || `Playback error (${persistedCode}).`);
        }, 950);
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
  }, [open, current]);

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

  const seek = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v || isLive) return;
      v.currentTime = Math.max(
        0,
        Math.min((v.duration || 0) - 0.5, v.currentTime + delta)
      );
    },
    [isLive]
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

  const onSeekChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = videoRef.current;
      if (!v || isLive || !v.duration) return;
      v.currentTime = (parseFloat(e.target.value) / 100) * v.duration;
    },
    [isLive]
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
    const p = current.poster?.trim();
    if (p) {
      try {
        const href =
          p.startsWith("http://") || p.startsWith("https://")
            ? p
            : new URL(p, window.location.origin).href;
        artwork.push({ src: href, sizes: "512x512", type: "image/jpeg" });
      } catch {
        /* invalid poster URL */
      }
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

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (
      (v as HTMLVideoElement & { requestPictureInPicture?: () => Promise<void> })
        .requestPictureInPicture
    ) {
      await v.requestPictureInPicture();
    }
  }, []);

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

  // Auto-hide controls (longer on TV — remotes rarely trigger mousemove)
  const wakeControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const hideMs =
      tvBrowser || silkLikeClient ? 22_000 : 3000;
    hideTimer.current = setTimeout(() => {
      if (isPlaying && !showSettings && !showSubs && !showShare && !showEpg) {
        setShowControls(false);
      }
    }, hideMs);
  }, [isPlaying, showSettings, showSubs, showShare, showEpg, tvBrowser, silkLikeClient]);

  const onVodGesturePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isLive) return;
      const v = videoRef.current;
      const strip = vodGestureStripRef.current;
      if (!v || !strip) return;
      const dur = v.duration;
      if (!Number.isFinite(dur) || dur < 2) return;
      strip.setPointerCapture(e.pointerId);
      vodScrubPointerRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startTime: v.currentTime,
        moved: false,
      };
      wakeControls();
    },
    [isLive, wakeControls]
  );

  const onVodGesturePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = vodScrubPointerRef.current;
      if (!s || s.pointerId !== e.pointerId) return;
      const v = videoRef.current;
      const strip = vodGestureStripRef.current;
      if (!v || !strip) return;
      const dur = v.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const dx = e.clientX - s.startX;
      if (Math.abs(dx) > 10) s.moved = true;
      if (!s.moved) return;
      const w = strip.getBoundingClientRect().width || 1;
      const frac = dx / w;
      v.currentTime = Math.max(
        0,
        Math.min(dur - 0.5, s.startTime + frac * dur * 0.45)
      );
      wakeControls();
    },
    [wakeControls]
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
      if (!s.moved) togglePlay();
      vodScrubPointerRef.current = null;
      wakeControls();
    },
    [togglePlay, wakeControls]
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

      if (tvBrowser) {
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
        if (
          flipWithArrowKeys &&
          (k === "MediaTrackNext" || k === "MediaTrackPrevious")
        ) {
          e.preventDefault();
          doFlip(k === "MediaTrackNext" ? 1 : -1);
          wakeControls();
          return;
        }
      }

      if (flipWithArrowKeys && (e.key === "ArrowUp" || e.key === "PageUp")) {
        e.preventDefault();
        doFlip(-1);
      } else if (
        flipWithArrowKeys &&
        (e.key === "ArrowDown" || e.key === "PageDown")
      ) {
        e.preventDefault();
        doFlip(1);
      } else if (
        tvBrowser &&
        !flipWithArrowKeys &&
        (e.key === "ArrowUp" || e.key === "PageUp")
      ) {
        e.preventDefault();
        const v = videoRef.current;
        if (v) {
          v.volume = Math.min(1, v.volume + 0.08);
          if (v.volume > 0) v.muted = false;
        }
      } else if (
        tvBrowser &&
        !flipWithArrowKeys &&
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
      if (e.key.toLowerCase() === "p") togglePip();
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
    wakeControls,
    isLive,
    flipWithArrowKeys,
    doFlip,
    tvBrowser,
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

  const progress = duration > 0 ? (time / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  const qualityLabel = useMemo(() => {
    if (currentLevel === -1) return "Auto";
    const l = levels[currentLevel];
    if (!l) return "Auto";
    return hlsRenditionLabel(l, currentLevel);
  }, [currentLevel, levels]);

  // Cast: Chromecast Web Sender SDK (loads when player/share opens; resilient to script races + unsupported browsers)
  type CastSenderUiState =
    | "inactive"
    | "loading"
    | "ready"
    | "unsupported"
    | "failed";
  const [castSenderState, setCastSenderState] =
    useState<CastSenderUiState>("inactive");
  const [castActionMessage, setCastActionMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!open) {
      setCastSenderState("inactive");
      setCastActionMessage(null);
      return;
    }
    if (typeof window === "undefined") return;
    if (silkLikeClient && !showShare) return;

    if (!shouldAttemptChromecastSenderLoad()) {
      setCastSenderState("unsupported");
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
      setCastSenderState("failed");
    };

    const succeed = () => {
      if (cancelled || completed) return;
      completed = true;
      clearTimers();
      setCastSenderState("ready");
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

    setCastSenderState("loading");

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
      window.__onGCastApiAvailable = prevGCastCb;
    };
  }, [open, showShare, silkLikeClient]);

  const cast = useCallback(async () => {
    if (!directUrl) return;
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
      await ctx.requestSession();
      const ChromeMedia = window.chrome?.cast?.media;
      if (!ChromeMedia?.MediaInfo || !ChromeMedia.LoadRequest) {
        setCastActionMessage(
          "This browser doesn’t expose Chromecast media APIs. Try Chrome or Edge, or copy the stream URL."
        );
        window.setTimeout(() => setCastActionMessage(null), 8000);
        return;
      }

      const vodIsHlsManifest =
        !isLive && /\.m3u8($|[?#])/i.test(directUrl);
      const contentType = isLive
        ? "application/x-mpegURL"
        : vodIsHlsManifest
          ? "application/x-mpegURL"
          : current?.containerExt === "mp4"
            ? "video/mp4"
            : current?.containerExt === "mkv"
              ? "video/x-matroska"
              : "video/mp4";

      const mediaInfo = new ChromeMedia.MediaInfo(
        directUrl,
        contentType
      ) as {
        streamType?: number;
        metadata?: { type: number; title?: string };
      };
      if (ChromeMedia.StreamType) {
        mediaInfo.streamType = isLive
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
      const session = (
        window.cast?.framework.CastContext.getInstance() as unknown as {
          getCurrentSession: () => {
            loadMedia: (r: unknown) => Promise<void>;
          } | null;
        }
      ).getCurrentSession?.();
      if (!session) {
        setCastActionMessage(
          "No Cast session. Pick your Chromecast or Google TV again, or copy the stream URL."
        );
        window.setTimeout(() => setCastActionMessage(null), 8000);
        return;
      }
      await session.loadMedia(request);
      setShowShare(false);
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
  }, [directUrl, isLive, current, setShowShare]);

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
    const url = current.url;
    if (!el || !url) return;
    const hls = hlsRef.current;
    try {
      if (hls) {
        hls.stopLoad();
        tryHlsLiveEdgeRestart(hls, hlsLiveEdgeRestartGateRef, true);
        voidSafeVideoPlay(el);
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-center p-0 sm:p-6 min-h-0 touch-manipulation"
        >
          <motion.div
            initial={{ scale: 0.96, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 20 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            ref={containerRef}
            onMouseMove={wakeControls}
            onClick={() => wakeControls()}
            className={cn(
              "relative isolate bg-black w-full max-w-[1400px] flex-1 min-h-0 sm:flex-none sm:aspect-video max-h-[100dvh] sm:max-h-[calc(100vh-3rem)] rounded-none sm:rounded-2xl overflow-hidden border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.7)]",
              "select-none"
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

            <video
              ref={videoRef}
              poster={isLive ? undefined : posterSrc}
              playsInline
              preload={
                silkLikeClient ? "metadata" : isLive ? "auto" : "metadata"
              }
              autoPlay
              onClick={togglePlay}
              className="size-full max-h-[100dvh] object-contain bg-black cursor-pointer [transform:translateZ(0)] will-change-transform"
            />

            {!isLive &&
              !error &&
              Number.isFinite(duration) &&
              duration > 2 && (
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

            {/* Loading spinner */}
            <AnimatePresence>
              {loading && !error && !needsTapToPlay && !stalled && (
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

            {/* Stalled: live vs VOD — VOD often stalls when WebKit can&apos;t decode MKV/HEVC, not &quot;offline&quot;. */}
            {stalled && !error && (
              <div className="absolute inset-x-0 bottom-24 mx-auto max-w-md px-4">
                <div className="glass rounded-xl px-4 py-3 text-center">
                  <div className="text-white text-sm font-medium">
                    Still loading…
                  </div>
                  <div className="text-white/70 text-xs mt-1">
                    {isLive ? (
                      <>
                        This channel may be offline at the provider. Try a
                        different one if it doesn&apos;t start in a moment.
                      </>
                    ) : (
                      <>
                        Movies and series can be slow to start on mobile, or
                        the file may use codecs this browser can&apos;t play
                        (MKV, HEVC, Dolby). Safari on iPhone doesn&apos;t change
                        that for most Xtream files—try VLC/Infuse or your
                        provider&apos;s app if nothing starts.
                      </>
                    )}
                  </div>
                </div>
              </div>
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
                  {streamSupportRequestId ? (
                    <div className="text-white/45 text-xs mt-3 font-mono break-all">
                      Reference: {streamSupportRequestId}
                    </div>
                  ) : null}
                  <div className="mt-5 flex gap-2 justify-center">
                    <button
                      onClick={() => {
                        setError(null);
                        setLoading(true);
                        const v = videoRef.current;
                        if (!v) return;
                        if (current?.kind === "live" && hlsRef.current) {
                          reloadLiveStream();
                          return;
                        }
                        if (hlsRef.current) {
                          hlsRef.current.startLoad();
                          voidSafeVideoPlay(v);
                          return;
                        }
                        v.load();
                        voidSafeVideoPlay(v);
                      }}
                      className="px-4 py-2 rounded-lg btn-brand text-sm"
                    >
                      Try again
                    </button>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            doFlip(-1);
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
                          className="grid size-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-white transition-colors"
                        >
                          <ChevronUp className="size-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            doFlip(1);
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
                          className="grid size-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-white transition-colors"
                        >
                          <ChevronDown className="size-4" />
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
                  <div className="flex items-start gap-3 px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/15 shadow-xl">
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

            {/* EPG drawer */}
            <AnimatePresence>
              {showEpg && isLive && (
                <motion.div
                  initial={{ x: "100%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: "100%", opacity: 0 }}
                  transition={{ ease: [0.2, 0.8, 0.2, 1], duration: 0.25 }}
                  className="absolute right-0 top-0 bottom-0 w-full sm:w-[360px] bg-black/85 backdrop-blur-md border-l border-white/10 z-10 flex flex-col overflow-hidden min-h-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="sticky top-0 z-[1] shrink-0 bg-black/70 backdrop-blur px-4 py-3 flex items-center justify-between border-b border-white/10">
                    <div className="text-white font-semibold text-sm">
                      Schedule
                    </div>
                    <button
                      onClick={() => setShowEpg(false)}
                      className="size-8 grid place-items-center rounded-lg hover:bg-white/10 text-white/80"
                      aria-label="Close schedule"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  {epgScheduleLoading && (
                    <div className="px-4 py-3 text-white/60 text-sm shrink-0">
                      Loading…
                    </div>
                  )}
                  {!epgScheduleLoading && epgDrawerRows.length === 0 && (
                    <div className="px-4 py-3 text-white/60 text-sm shrink-0">
                      No EPG data for this channel.
                    </div>
                  )}
                  {epgDrawerRows.length > 0 && (
                    <PlayerScheduleVirtualList
                      drawerOpen={showEpg}
                      rows={epgDrawerRows}
                      clockMs={clockMs}
                    />
                  )}
                </motion.div>
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
                        onChange={onSeekChange}
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
                        `${formatTime(time)} / ${formatTime(duration)}`
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

                      {/* Subtitles */}
                      {subtitles.length > 0 && (
                        <div className="relative">
                          <button
                            onClick={() => {
                              setShowSubs((s) => !s);
                              setShowSettings(false);
                              setShowShare(false);
                            }}
                            aria-label="Subtitles"
                            className={cn(
                              "size-9 grid place-items-center rounded-lg hover:bg-white/10",
                              showSubs && "bg-white/15",
                              activeSubtitle !== -1 && "text-(--brand-2)"
                            )}
                          >
                            <Captions className="size-4" />
                          </button>
                          <AnimatePresence>
                            {showSubs && (
                              <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 6 }}
                                className="absolute right-0 bottom-11 w-56 glass rounded-xl p-1.5 overflow-hidden max-h-72 overflow-y-auto"
                              >
                                <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/50">
                                  Subtitles
                                </div>
                                <button
                                  onClick={() => {
                                    switchSubtitle(-1);
                                    setShowSubs(false);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                                    activeSubtitle === -1 && "bg-white/10"
                                  )}
                                >
                                  Off
                                  {activeSubtitle === -1 && (
                                    <Check className="size-3.5" />
                                  )}
                                </button>
                                {subtitles.map((s) => (
                                  <button
                                    key={s.id}
                                    onClick={() => {
                                      switchSubtitle(s.id);
                                      setShowSubs(false);
                                    }}
                                    className={cn(
                                      "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                                      activeSubtitle === s.id && "bg-white/10"
                                    )}
                                  >
                                    <span className="truncate">
                                      {s.label}
                                      {s.lang && (
                                        <span className="text-white/40 ml-1.5">
                                          {s.lang}
                                        </span>
                                      )}
                                    </span>
                                    {activeSubtitle === s.id && (
                                      <Check className="size-3.5 shrink-0" />
                                    )}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Quality / settings */}
                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowSettings((s) => !s);
                            setShowSubs(false);
                            setShowShare(false);
                          }}
                          aria-label="Settings"
                          className="h-9 px-2.5 grid grid-flow-col place-items-center gap-1.5 rounded-lg hover:bg-white/10 text-xs"
                        >
                          <Settings2 className="size-4" />
                          <span className="hidden sm:inline">{qualityLabel}</span>
                        </button>
                        <AnimatePresence>
                          {showSettings && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 6 }}
                              className="absolute right-0 bottom-11 w-56 glass rounded-xl p-1.5 overflow-hidden max-h-72 overflow-y-auto"
                            >
                              <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/50">
                                Quality
                              </div>
                              {levels.length > 1 &&
                                typeof navigator !== "undefined" &&
                                isChromiumBasedDesktopBrowser() && (
                                  <div className="px-3 pb-2 text-[11px] text-white/45 leading-snug">
                                    Brave and Chrome default to the safest rung to reduce
                                    Dolby/HEVC drop-outs. Pick Auto or higher for more bitrate
                                    (riskier on some channels).
                                  </div>
                                )}
                              <button
                                onClick={() => {
                                  switchLevel(-1);
                                  setShowSettings(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                                  currentLevel === -1 && "bg-white/10"
                                )}
                              >
                                Auto
                                {currentLevel === -1 && (
                                  <Check className="size-3.5" />
                                )}
                              </button>
                              {levels.length === 0 && (
                                <div className="px-3 py-2 text-xs text-white/40">
                                  Single quality stream
                                </div>
                              )}
                              {levels
                                .map((l, i) => ({ l, i }))
                                .sort(
                                  (a, b) =>
                                    (b.l.height || 0) - (a.l.height || 0)
                                )
                                .map(({ l, i }) => (
                                  <button
                                    key={i}
                                    onClick={() => {
                                      switchLevel(i);
                                      setShowSettings(false);
                                    }}
                                    className={cn(
                                      "w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center justify-between",
                                      currentLevel === i && "bg-white/10"
                                    )}
                                  >
                                    <span>
                                      {(() => {
                                        const primary = hlsRenditionLabel(l, i);
                                        const fromBitrateOnly =
                                          !l.height &&
                                          !(l.name ?? "").trim() &&
                                          Boolean(l.bitrate);
                                        return (
                                          <>
                                            {primary}
                                            {l.bitrate && !fromBitrateOnly ? (
                                              <span className="text-white/40">
                                                {" "}
                                                · {Math.round(l.bitrate / 1000)}kbps
                                              </span>
                                            ) : null}
                                          </>
                                        );
                                      })()}
                                    </span>
                                    {currentLevel === i && (
                                      <Check className="size-3.5" />
                                    )}
                                  </button>
                                ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Cast / Share menu */}
                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowShare((s) => !s);
                            setShowSettings(false);
                            setShowSubs(false);
                          }}
                          aria-label="Share"
                          className={cn(
                            "size-9 grid place-items-center rounded-lg hover:bg-white/10",
                            showShare && "bg-white/15"
                          )}
                        >
                          <Share2 className="size-4" />
                        </button>
                        <AnimatePresence>
                          {showShare && (
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 6 }}
                              className="absolute right-0 bottom-11 w-72 glass rounded-xl p-1.5 overflow-hidden"
                            >
                              <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/50">
                                Cast & open elsewhere
                              </div>
                              <div className="px-3 pb-1 text-[10px] text-white/45 leading-snug">
                                Cast to TV uses{" "}
                                <span className="text-white/60">Google Cast</span>{" "}
                                (Chromecast, Google TV, Cast‑built‑in displays). Roku,
                                Samsung hubs, and AirPlay need the copied URL or their
                                own apps.
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  void cast();
                                }}
                                disabled={
                                  castSenderState !== "ready" || !directUrl
                                }
                                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <span className="flex items-center gap-2">
                                  <Cast className="size-4 shrink-0" />
                                  <span>
                                    {castSenderState === "ready" &&
                                      "Cast to TV"}
                                    {castSenderState === "loading" &&
                                      "Cast to TV (loading…)"}
                                    {castSenderState === "unsupported" &&
                                      "Cast to TV (not in this browser)"}
                                    {castSenderState === "failed" &&
                                      "Cast to TV (unavailable)"}
                                    {castSenderState === "inactive" &&
                                      "Cast to TV"}
                                  </span>
                                </span>
                                {castSenderState === "unsupported" && (
                                  <span className="pl-6 text-[11px] text-white/50 leading-snug">
                                    Use Chrome, Edge, or Brave on a computer or
                                    Android. On iPhone, copy the URL below.
                                  </span>
                                )}
                                {castSenderState === "failed" && (
                                  <span className="pl-6 text-[11px] text-white/50 leading-snug">
                                    Cast didn’t load (blocked network, extension, or
                                    ad blocker). Refresh or copy the stream URL.
                                  </span>
                                )}
                              </button>
                              {castActionMessage && (
                                <div className="mx-2 mb-1 rounded-lg border border-amber-400/25 bg-amber-950/40 px-2.5 py-2 text-[11px] text-amber-50/95 leading-snug">
                                  {castActionMessage}
                                </div>
                              )}
                              <button
                                onClick={copyDirectUrl}
                                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center gap-2"
                              >
                                {copied ? (
                                  <Check className="size-4 text-(--brand-2)" />
                                ) : (
                                  <Copy className="size-4" />
                                )}
                                {copied ? "Copied!" : "Copy stream URL"}
                              </button>
                              {directUrl && (
                                <a
                                  href={directUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => setShowShare(false)}
                                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 flex items-center gap-2"
                                >
                                  <ExternalLink className="size-4" />
                                  Open in external player
                                </a>
                              )}
                              <div className="px-3 pt-1 pb-2 text-[10px] text-white/40">
                                Paste the URL into VLC, IINA, or Infuse to
                                stream on any device.
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <button
                        onClick={togglePip}
                        aria-label="Picture in picture"
                        className={cn(
                          "size-9 hidden sm:grid place-items-center rounded-lg hover:bg-white/10",
                          isPip && "bg-white/10"
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
