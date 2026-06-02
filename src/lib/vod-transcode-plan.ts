/** How ffmpeg should treat an upstream VOD file after ffprobe. */
export type VodTranscodePlanMode = "copy" | "copyVideo" | "transcode";

export type VodTranscodePlan = {
  mode: VodTranscodePlanMode;
  /** Target max height when re-encoding video (transcode mode). */
  maxHeight: number;
};

const BROWSER_AUDIO = new Set(["aac", "mp3", "mp4a"]);

export function planFromProbeCodecs(
  videoCodec: string | null | undefined,
  audioCodec: string | null | undefined,
  opts?: { maxHeight?: number }
): VodTranscodePlan {
  const maxHeight = opts?.maxHeight ?? 720;
  const v = (videoCodec ?? "").toLowerCase().trim();
  const a = (audioCodec ?? "").toLowerCase().trim();

  const h264 =
    v === "h264" ||
    v === "avc" ||
    v === "avc1" ||
    v.startsWith("h264");
  const hevc =
    v === "hevc" ||
    v === "h265" ||
    v === "hvc1" ||
    v === "hev1" ||
    v.startsWith("hevc");

  if (h264 && BROWSER_AUDIO.has(a)) {
    return { mode: "copy", maxHeight };
  }
  if (h264 && !hevc) {
    return { mode: "copyVideo", maxHeight };
  }
  if (hevc) {
    return { mode: "transcode", maxHeight };
  }
  return { mode: "transcode", maxHeight };
}
