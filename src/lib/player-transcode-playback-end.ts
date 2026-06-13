/** How close to the buffer end counts as “at the edge” (seconds). */
export const TRANSCODE_BUFFER_EDGE_SEC = 1.25;

/** How close to the full episode duration counts as the finale (seconds). */
export const TRANSCODE_EPISODE_END_MARGIN_SEC = 45;

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

  const absolute = startOffsetSec + video.currentTime;
  if (isNearEpisodeEnd(absolute, durationSec)) return true;

  if (
    encodedSecRel > 8 &&
    video.currentTime >= encodedSecRel - TRANSCODE_BUFFER_EDGE_SEC &&
    isNearEpisodeEnd(startOffsetSec + encodedSecRel, durationSec)
  ) {
    return true;
  }

  return false;
}
