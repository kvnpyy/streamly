/** Default manifest HTTP wait for initial transcode (ms). */
export const VOD_TRANSCODE_MANIFEST_HTTP_WAIT_MS = 16_000;

/** Max wait while ffmpeg produces the first playlist (ms). */
export const VOD_TRANSCODE_PLAYLIST_WAIT_MS = 120_000;

/**
 * Mid-file seeks restart ffmpeg near `tc_seek` and often need far longer than
 * the opening-moments encode before the first HLS segment exists.
 */
export function transcodeManifestWaitMs(
  seekSec: number,
  opts?: {
    httpWaitMs?: number;
    playlistWaitMs?: number;
  }
): number {
  const http = opts?.httpWaitMs ?? VOD_TRANSCODE_MANIFEST_HTTP_WAIT_MS;
  const playlist = opts?.playlistWaitMs ?? VOD_TRANSCODE_PLAYLIST_WAIT_MS;
  if (seekSec > 0) return playlist;
  // Cold MKV start: heavy files often need >30s before seg_00000 exists.
  return Math.min(playlist, Math.max(http, 60_000));
}
