import type { Level } from "hls.js";

export function levelsListKey(levels: Level[] | undefined): string {
  if (!levels?.length) return "";
  return levels
    .map((l) => `${l.width ?? 0}x${l.height ?? 0}@${l.bitrate ?? 0}`)
    .join("|");
}

/** Shared hls.js tuning for all IPTV HLS (live + VOD) on Chromium/Firefox; live adds sync/edge options only. */
export function buildIptvHlsJsConfig(opts: {
  isLive: boolean;
  mobileLike: boolean;
  livingRoomLike?: boolean;
  silkLike?: boolean;
  /** Win/Mac Chrome, Brave, Edge — MSE live needs calmer sync than Safari native HLS. */
  chromiumDesktop?: boolean;
}) {
  const {
    isLive,
    mobileLike,
    livingRoomLike = false,
    silkLike = false,
    chromiumDesktop = false,
  } = opts;
  const tightBuffers = mobileLike;

  const timeouts = silkLike ? 42_000 : 25_000;
  const manifestRetry = silkLike ? 10 : 8;
  const fragRetry = silkLike ? 20 : 14;

  const chromiumDesktopLive =
    isLive &&
    !tightBuffers &&
    !livingRoomLike &&
    !silkLike &&
    chromiumDesktop;

  const tvLivingRoomLive = isLive && (livingRoomLike || silkLike);

  const lowLatencyDesktopLive =
    isLive &&
    !tightBuffers &&
    !livingRoomLike &&
    !silkLike &&
    !chromiumDesktop;

  let maxBuf = tightBuffers ? 45 : 62;
  let maxMaxBuf = tightBuffers ? 220 : 480;
  let backBuf = tightBuffers ? 90 : 120;
  let abrUp = 0.55;
  let maxHoleLive = 0.55;
  let maxHoleVod = 0.45;

  if (chromiumDesktopLive) {
    maxBuf = 42;
    maxMaxBuf = 96;
    backBuf = 64;
    abrUp = 0.12;
    maxHoleLive = 0.55;
  } else if (tvLivingRoomLive) {
    maxBuf = 40;
    maxMaxBuf = 120;
    backBuf = 72;
    abrUp = 0.14;
    maxHoleLive = 0.65;
    maxHoleVod = 0.55;
  } else if (lowLatencyDesktopLive) {
    maxBuf = 22;
    maxMaxBuf = 55;
    backBuf = 36;
    abrUp = Math.min(abrUp, 0.45);
    maxHoleLive = 0.45;
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
    ? tvLivingRoomLive
      ? 7
      : livingRoomLike
        ? 6
        : chromiumDesktopLive
          ? 5
          : lowLatencyDesktopLive
            ? 2
            : tightBuffers
              ? 4
              : 3
    : 3;
  if (isLive && silkLike && !tvLivingRoomLive) liveSyncCount += 1;

  return {
    lowLatencyMode: false,
    capLevelToPlayerSize: isLive || livingRoomLike || silkLike,
    enableWorker: false,
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
    startFragPrefetch: !silkLike && !tvLivingRoomLive,
    liveSyncDurationCount: liveSyncCount,
    ...(silkLike ? { maxFragLookUpTolerance: 0.48 } : {}),
    ...(isLive
      ? {
          liveDurationInfinity: true,
          liveMaxLatencyDurationCount: chromiumDesktopLive
            ? 10
            : tvLivingRoomLive
              ? 12
              : lowLatencyDesktopLive
                ? 4
                : livingRoomLike
                  ? 10
                  : tightBuffers
                    ? 8
                    : 7,
          maxLiveSyncPlaybackRate:
            chromiumDesktopLive || tvLivingRoomLive
              ? 1
              : lowLatencyDesktopLive
                ? 1.15
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
            chromiumDesktopLive || lowLatencyDesktopLive || tvLivingRoomLive
              ? 0
              : silkLike || livingRoomLike
                ? 1
                : 2,
          initialLiveManifestSize: chromiumDesktopLive
            ? 2
            : tvLivingRoomLive
              ? 2
              : lowLatencyDesktopLive
                ? 1
                : mobileLike || livingRoomLike || silkLike
                  ? 2
                  : 2,
        }
      : {}),
  };
}

/** iPhone/iPad live via hls.js — calmer live-edge sync than default mobile config. */
export function buildAppleMobileLiveHlsConfig() {
  const base = buildIptvHlsJsConfig({ isLive: true, mobileLike: true });
  return {
    ...base,
    maxLiveSyncPlaybackRate: 1.06,
    liveSyncOnStallIncrease: 0,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 7,
    maxBufferLength: 32,
    maxMaxBufferLength: 88,
    backBufferLength: 56,
    maxBufferHole: 0.55,
    nudgeOffset: 0.08,
    nudgeMaxRetry: 10,
    initialLiveManifestSize: 2,
  };
}
