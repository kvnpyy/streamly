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

/**
 * The viewer scrubbed backward. The playhead is still at the old tip, so
 * snap-recovery must not treat that rewind as an HLS glitch and yank it forward.
 * This only runs while playing — a paused scrub never hit the recovery path.
 */
export function shouldHoldTranscodeSeekTarget(opts: {
  currentRel: number;
  maxSeenRel: number;
  watermarkRel: number;
}): boolean {
  if (!Number.isFinite(opts.watermarkRel) || !Number.isFinite(opts.maxSeenRel)) {
    return false;
  }
  if (!Number.isFinite(opts.currentRel)) return false;
  if (!(opts.watermarkRel + 1 < opts.maxSeenRel)) return false;
  return opts.currentRel > opts.watermarkRel + 1.25;
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
  if (video.paused) return false;
  if (!isAtTranscodeBufferEdge(video)) return false;

  const relative = video.currentTime;
  const absolute = startOffsetSec + relative;

  if (isNearEpisodeEnd(absolute, durationSec)) return true;

  if (isEncodeCaughtUp(relative, encodedSecRel)) {
    // Unknown duration — only end when a substantial encode window finished.
    if (!Number.isFinite(durationSec) || durationSec < 60) {
      return encodedSecRel >= 90;
    }
    if (
      encodedSecRel > 8 &&
      isNearEpisodeEnd(startOffsetSec + encodedSecRel, durationSec)
    ) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Where to keep loading after a stall. A collapse toward the opening while
 * the episode was already underway is an HLS snap, not a real restart.
 */
export function vodTranscodeRecoveryPlayhead(opts: {
  currentRel: number;
  highWaterRel: number;
}): number {
  const current = Number.isFinite(opts.currentRel)
    ? Math.max(0, opts.currentRel)
    : 0;
  const high = Number.isFinite(opts.highWaterRel)
    ? Math.max(0, opts.highWaterRel)
    : 0;
  if (detectTranscodeBackwardSnap(current, high)) return high;
  return current;
}

/**
 * True while a title change has reset the high-water mark but `<video>` still
 * reports the previous episode. Treating that clock as a stall seeks backward
 * inside the episode the viewer is leaving — Next episode then appears to rewind.
 */
export function shouldIgnoreOutgoingTranscodeClock(opts: {
  holdOutgoing: boolean;
  currentRel: number;
  highWaterRel: number;
}): boolean {
  if (!opts.holdOutgoing) return false;
  const current = Number.isFinite(opts.currentRel) ? opts.currentRel : 0;
  const high = Number.isFinite(opts.highWaterRel)
    ? Math.max(0, opts.highWaterRel)
    : 0;
  return current > high + 15;
}

/** Largest gap a waiting playhead may cross on its own. */
export const VOD_WAIT_HOLE_MAX_SEC = 0.2;

/**
 * Where to put the playhead when Chrome pauses on a segment gap.
 * Only a gap already smaller than a blink is crossed. Stepping through a
 * buffer that is already ahead skips the episode after a long pause.
 */
export function vodTranscodeWaitBridgeSec(
  currentTime: number,
  ranges: ReadonlyArray<{ start: number; end: number }>,
  paused: boolean
): number | null {
  if (paused || !Number.isFinite(currentTime)) return null;
  let nextStart: number | null = null;
  for (const range of ranges) {
    if (
      currentTime >= range.start - 0.02 &&
      currentTime < range.end - 0.3
    ) {
      // Plenty of this range is already buffered. Seeking here skips picture.
      return null;
    }
    if (
      range.start > currentTime + 0.01 &&
      (nextStart == null || range.start < nextStart)
    ) {
      nextStart = range.start;
    }
  }
  if (nextStart != null && nextStart - currentTime <= VOD_WAIT_HOLE_MAX_SEC) {
    return nextStart + 0.01;
  }
  return null;
}

/** HLS snap-back near the finale — mid-episode snaps are recovery, not ended. */
export function shouldTreatTranscodeSnapAsEnded(
  currentRel: number,
  maxSeenRel: number,
  startOffsetSec: number,
  durationSec: number
): boolean {
  if (!detectTranscodeBackwardSnap(currentRel, maxSeenRel)) return false;
  const absolute = startOffsetSec + currentRel;
  return isNearEpisodeEnd(absolute, durationSec);
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
