/**
 * Live IPTV HLS policy: codec-safe ladders, soft recovery, and user-facing messages.
 * Shared by the player overlay — keep Windows Chrome / TV browser tuning here.
 */

import {
  isAppleMobileWebKitDevice,
  isChromiumBasedDesktopBrowser,
  isSafariFamilyWithoutChromium,
} from "@/lib/browser";
import { voidSafeVideoPlay } from "@/lib/video-play";
import Hls, { type Level } from "hls.js";

export const HLS_LIVE_EDGE_RESTART_MIN_MS = 12_000;

/** After the first buffered fragment, suppress surfacing codec/MSE errors this long. */
export const LIVE_PLAYBACK_ERROR_GRACE_MS = 45_000;

/** Defer `<video error>` while hls.js recovers (avoids ~1s false failures). */
export const LIVE_VIDEO_ERROR_DEFER_MS = 3_200;

/**
 * Reload the live pipeline. `startLoad(-1)` jumps to the manifest edge and often makes
 * playback snap backward — reserve that for explicit user Try again (`force: true`).
 */
export function tryHlsLiveEdgeRestart(
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
    if (force) {
      hls.startLoad(-1);
    } else {
      hls.startLoad();
    }
    return true;
  } catch {
    return false;
  }
}

/** Unstick a wedged TV decoder without stripping rungs or jumping to the live edge. */
export function recoverTvLiveMedia(
  hls: Hls,
  video: HTMLVideoElement
): void {
  try {
    hls.recoverMediaError();
  } catch {
    /* noop */
  }
  voidSafeVideoPlay(video);
}

/**
 * Codec/ABR tune + media recover without `stopLoad` / live-edge `startLoad(-1)`.
 * Use for automatic recovery while the user is watching — avoids snap-back loops.
 */
export function applyGentleLiveHlsRecovery(
  hls: Hls,
  video: HTMLVideoElement
): void {
  stripHevcLevelsIfSaferAlternativesExist(hls);
  stripDolbyLevelsIfSaferAlternativesExist(hls);
  stripDtsLevelsIfSaferAlternativesExist(hls);
  preferBrowserFriendlyAudioTrack(hls);
  const maxSafe = maxSafeLevelIndex(hls.levels);
  if (maxSafe >= 0) {
    hls.autoLevelCapping = maxSafe;
  }
  try {
    hls.recoverMediaError();
  } catch {
    /* noop */
  }
  voidSafeVideoPlay(video);
}

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

export function hlsRenditionLabel(level: Level, index: number): string {
  const nm = (level.name ?? "").trim();
  if (nm) return nm;
  if (level.height) return `${level.height}p`;
  if (level.width) return `${Math.round(level.width)}p`;
  if (level.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`;
  return `Stream ${index + 1}`;
}

export function levelDeclaresDolbyDigital(level: Level): boolean {
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

export function levelDeclaresDts(level: Level): boolean {
  const blob = levelTelemetryBlob(level);
  return (
    blob.includes("dts") ||
    blob.includes("dtsc") ||
    blob.includes("dtsh") ||
    blob.includes("dtsx")
  );
}

export function levelDeclaresNonPreferredChromePackagedAudio(
  level: Level
): boolean {
  return levelDeclaresDolbyDigital(level) || levelDeclaresDts(level);
}

export function stripDolbyLevelsIfSaferAlternativesExist(
  hls: Pick<Hls, "levels" | "removeLevel">
): void {
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

export function stripDtsLevelsIfSaferAlternativesExist(
  hls: Pick<Hls, "levels" | "removeLevel">
): void {
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

export function levelDeclaresHevc(level: Level): boolean {
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

export function stripHevcLevelsIfSaferAlternativesExist(
  hls: Pick<Hls, "levels" | "removeLevel">
): void {
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

export function indexOfLowestSafeLevel(levels: Level[]): number {
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
      h > 0
        ? h
        : typeof lv.bitrate === "number" && lv.bitrate > 0
          ? lv.bitrate / 1e6
          : Infinity;
    if (metric < bestMetric) {
      bestMetric = metric;
      best = i;
    }
  });
  if (!Number.isFinite(bestMetric)) {
    return -1;
  }
  return best;
}

export function isLevelSafeForChromeMse(level: Level | undefined): boolean {
  if (!level) return false;
  return (
    !levelDeclaresHevc(level) &&
    !levelDeclaresNonPreferredChromePackagedAudio(level)
  );
}

export function maxSafeLevelIndex(levels: Level[]): number {
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

export function tryCapAbrLower(hls: Hls): void {
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

export function preferBrowserFriendlyAudioTrack(
  hls: Pick<Hls, "audioTracks" | "audioTrack">
): void {
  const tracks = hls.audioTracks;
  if (!tracks?.length) return;

  const rank = (codec: string | undefined) => {
    const c = (codec ?? "").toLowerCase();
    if (c.includes("mp4a") || c.includes("aac")) return 0;
    if (c.includes("opus")) return 1;
    if (
      c.includes("ec-3") ||
      c.includes("eac3") ||
      c.includes("ac-3") ||
      c.includes("ac3")
    )
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

/** User Try again — full reload cycle; may jump to the live edge once. */
export function applySoftLiveHlsRecovery(
  hls: Hls,
  video: HTMLVideoElement,
  gateRef: { current: number }
): void {
  applyGentleLiveHlsRecovery(hls, video);
  try {
    hls.stopLoad();
    tryHlsLiveEdgeRestart(hls, gateRef, true);
  } catch {
    /* noop */
  }
  voidSafeVideoPlay(video);
}

export type StabilizeLiveHlsContext = {
  isLive: boolean;
  livingRoomLike: boolean;
  silkLike: boolean;
  appleMobileLiveMse: boolean;
  /** Phone-sized mobile live (not TV/Silk) — pin safe quality rung to avoid HEVC/Dolby drift. */
  mobilePhoneLive?: boolean;
};

export function stabilizeBrowserFriendlyCodecs(
  hls: Hls,
  ctx: StabilizeLiveHlsContext
): void {
  stripHevcLevelsIfSaferAlternativesExist(hls);
  stripDolbyLevelsIfSaferAlternativesExist(hls);
  stripDtsLevelsIfSaferAlternativesExist(hls);
  preferBrowserFriendlyAudioTrack(hls);

  const desktopMseLiveTune =
    ctx.isLive &&
    !ctx.livingRoomLike &&
    !ctx.silkLike &&
    !ctx.appleMobileLiveMse &&
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
    (ctx.livingRoomLike || ctx.silkLike || ctx.mobilePhoneLive) &&
    hls.levels?.length
  ) {
    try {
      const startIdx = indexOfLowestSafeLevel(hls.levels);
      if (startIdx >= 0) {
        hls.startLevel = startIdx;
        if (ctx.isLive) {
          /** Hold ABR inside decode-safe rungs — climbing on TV causes visible time jumps. */
          hls.autoLevelCapping = startIdx;
          if (!hls.autoLevelEnabled) {
            hls.currentLevel = startIdx;
          }
        }
      }
    } catch {
      /* noop */
    }
  }
}

export function liveCodecUserMessage(): string {
  const onWebKit =
    isSafariFamilyWithoutChromium() || isAppleMobileWebKitDevice();
  if (onWebKit) {
    return "This channel may use audio or video Safari can't decode here (common on PPV feeds with Dolby-only audio or HEVC-only ladders). Try Chromecast from Chrome or Edge on a computer, your provider's IPTV app, VLC, or another listing if available.";
  }
  if (isChromiumBasedDesktopBrowser()) {
    return "This channel may use Dolby, DTS, or HEVC that Chrome and Brave can't play in-page. Try Safari on Mac or iPhone, Chromecast, or your provider's native app.";
  }
  return "This channel uses a format or codec your browser may not support (common on PPV / event feeds). Try another browser, Chromecast, or your provider's native app.";
}

export function livePlaybackStoppedMessage(wasPlayingSmoothly: boolean): string {
  if (!wasPlayingSmoothly) {
    return `${liveCodecUserMessage()} Tap Try again — we will reload on a safer quality rung.`;
  }
  if (isChromiumBasedDesktopBrowser()) {
    return "Playback stopped after this channel was running smoothly. Tap Try again to reload on a safer quality rung. If it keeps happening, the feed may be using Dolby/DTS or HEVC that Chrome cannot play — try your provider's app or Chromecast.";
  }
  return "Playback stopped after this channel was running. Tap Try again. If it keeps failing, try another browser or your provider's app.";
}
