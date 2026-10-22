/** HAVE_CURRENT_DATA — duplicated so this stays free of the DOM lib. */
const HAVE_CURRENT_DATA = 2;

export type PlaybackElementSnapshot = {
  error: unknown;
  paused: boolean;
  ended: boolean;
  readyState: number;
  videoWidth: number;
  currentTime: number;
};

/**
 * The picture is actually moving. A startup "Try again" overlay that is still
 * up at this point is stale — playback found the stream after the timer fired.
 */
export function playbackFailureOverlayShouldDismiss(
  video: PlaybackElementSnapshot
): boolean {
  if (video.error) return false;
  if (video.ended || video.paused) return false;
  if (video.readyState < HAVE_CURRENT_DATA) return false;
  if (!(video.videoWidth > 0)) return false;
  if (!(Number.isFinite(video.currentTime) && video.currentTime > 0.2)) {
    return false;
  }
  return true;
}

/**
 * Slow-start timers should not raise "Unable to play" once bytes or a frame
 * have arrived. Checked again after any await, because the element can start
 * during the status fetch.
 */
export function startupFailureStillApplies(
  video: (PlaybackElementSnapshot & { bufferedLength: number }) | null
): boolean {
  if (!video) return true;
  if (playbackFailureOverlayShouldDismiss(video)) return false;
  if (video.readyState >= HAVE_CURRENT_DATA) return false;
  if (video.bufferedLength > 0) return false;
  return true;
}
