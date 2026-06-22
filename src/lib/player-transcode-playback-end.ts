/** How close to the buffer end counts as “at the edge” (seconds). */
export const TRANSCODE_BUFFER_EDGE_SEC = 1.25;

/** How close to the full episode duration counts as the finale (seconds). */
export const TRANSCODE_EPISODE_END_MARGIN_SEC = 45;

/** Backward playhead jump larger than this (seconds) is treated as an HLS snap-back loop. */
export const TRANSCODE_BACKWARD_SNAP_SEC = 3;

export function bufferedEndSec(video: HTMLVideoElement): number {
  let bufEnd = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    bufEnd = Math.max(bufEnd, video.buffered.end(i));
  }
  return bufEnd;
}

export function bufferAheadSec(video: HTMLVideoElement): number {
  const bufEnd = bufferedEndSec(video);
  if (bufEnd <= 0) return 0;
  return Math.max(0, bufEnd - video.currentTime);
}

export function isNearEpisodeEnd(
  absoluteSec: number,
  durationSec: number,
  marginSec = TRANSCODE_EPISODE_END_MARGIN_SEC
): boolean {
  if (!Number.isFinite(durationSec) || durationSec < 60) return false;
  if (!Number.isFinite(absoluteSec) || absoluteSec < 0) return false;
  return absoluteSec >= durationSec - marginSec;
}

export function isAtTranscodeBufferEdge(
  video: HTMLVideoElement,
  thresholdSec = TRANSCODE_BUFFER_EDGE_SEC
): boolean {
  const ahead = bufferAheadSec(video);
  return ahead <= thresholdSec && video.currentTime > 0.5;
}

/** Encoder has caught up — no more segments will arrive beyond the current edge. */
export function isEncodeCaughtUp(
  relativeSec: number,
  encodedSecRel: number
): boolean {
  return (
    encodedSecRel > 15 &&
    relativeSec >= encodedSecRel - TRANSCODE_BUFFER_EDGE_SEC
  );
}

export function detectTranscodeBackwardSnap(
  currentRel: number,
  maxSeenRel: number
): boolean {
  return (
    maxSeenRel > 8 &&
    currentRel < maxSeenRel - TRANSCODE_BACKWARD_SNAP_SEC
  );
}

export type TranscodePlaybackEndParams = {
  video: HTMLVideoElement;
  startOffsetSec: number;
  durationSec: number;
  encodedSecRel: number;
};

/**
 * EVENT-style transcode playlists rarely fire `<video ended>` — treat buffer edge
 * at the finale as end-of-playback so autoplay can run instead of live-sync loops.
 */
export function shouldTreatTranscodeAsEnded(
  params: TranscodePlaybackEndParams
): boolean {
  const { video, startOffsetSec, durationSec, encodedSecRel } = params;
  if (video.paused && video.ended) return true;
  if (!isAtTranscodeBufferEdge(video)) return false;

  const relative = video.currentTime;

  if (isEncodeCaughtUp(relative, encodedSecRel)) return true;

  const absolute = startOffsetSec + relative;
  if (isNearEpisodeEnd(absolute, durationSec)) return true;

  if (
    encodedSecRel > 8 &&
    relative >= encodedSecRel - TRANSCODE_BUFFER_EDGE_SEC &&
    isNearEpisodeEnd(startOffsetSec + encodedSecRel, durationSec)
  ) {
    return true;
  }

  return false;
}

export type SignalTranscodeEndedOpts = {
  video: HTMLVideoElement;
  hls?: { stopLoad: () => void } | null;
};

/**
 * Pause, stop manifest polling, and fire `ended` once — prevents hls.js live-sync
 * from snapping the playhead back to the start of the EVENT window.
 */
export function signalTranscodePlaybackEnded(
  opts: SignalTranscodeEndedOpts
): void {
  const { video, hls } = opts;
  try {
    hls?.stopLoad();
  } catch {
    /* noop */
  }
  try {
    video.pause();
  } catch {
    /* noop */
  }
  if (!video.ended) {
    try {
      video.dispatchEvent(new Event("ended"));
    } catch {
      /* noop */
    }
  }
}
