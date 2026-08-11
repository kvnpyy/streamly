/**
 * Detect progressive VOD that paints video but never decodes audio
 * (common with single-track AC-3/DTS in Chromium).
 *
 * Returns:
 * - `true` — signals strongly suggest no decodable audio
 * - `false` — audio is present / being decoded
 * - `"unknown"` — browser APIs don't expose enough to decide yet
 */
export function videoLikelyMissingDecodableAudio(
  video: HTMLVideoElement
): boolean | "unknown" {
  const v = video as HTMLVideoElement & {
    mozHasAudio?: boolean;
    webkitAudioDecodedByteCount?: number;
  };

  if (typeof v.mozHasAudio === "boolean") {
    return !v.mozHasAudio;
  }

  if (typeof v.webkitAudioDecodedByteCount === "number") {
    // HAVE_CURRENT_DATA === 2 — avoid HTMLMediaElement for Node/unit tests.
    if (video.currentTime < 1.5 || video.readyState < 2) {
      return "unknown";
    }
    return v.webkitAudioDecodedByteCount === 0;
  }

  return "unknown";
}
