/** How ffmpeg should treat an upstream VOD file after ffprobe. */
export type VodTranscodePlanMode = "copy" | "copyVideo" | "transcode";

export type VodTranscodePlan = {
  mode: VodTranscodePlanMode;
  /** Target max height when re-encoding video (transcode mode). */
  maxHeight: number;
};

const BROWSER_AUDIO = new Set(["aac", "mp3", "mp4a"]);

export function clampTranscodeMaxHeight(maxHeight: number): number {
  return Number.isFinite(maxHeight) && maxHeight >= 360 && maxHeight <= 1080
    ? Math.round(maxHeight)
    : 540;
}

/**
 * Height-capped, 16-aligned scale. Never pass maxHeight as width — that produced
 * 540x304 from 1080p, which hardware/MSE decoders smear into grey/false color.
 */
export function transcodeScaleFilter(maxHeight: number): string {
  const h = clampTranscodeMaxHeight(maxHeight);
  return `scale=-2:'min(${h},ih)':force_original_aspect_ratio=decrease:force_divisible_by=16,format=yuv420p`;
}

/** libx264 flags that stay Main even with the ultrafast preset (which defaults to Baseline). */
export function transcodeLibx264Args(opts: {
  preset: string;
  maxHeight: number;
  gop: number;
}): string[] {
  return [
    "-c:v",
    "libx264",
    "-preset",
    opts.preset,
    "-profile:v",
    "main",
    "-level:v",
    "4.0",
    "-pix_fmt",
    "yuv420p",
    "-x264-params",
    "cabac=1:bframes=0:ref=1:8x8dct=0",
    "-fps_mode",
    "cfr",
    "-g",
    String(opts.gop),
    "-keyint_min",
    String(opts.gop),
    "-sc_threshold",
    "0",
    // Do not also force keyframes at exact hls_time. Combined with -g that
    // inserts a second keyframe one frame early, and ffmpeg writes a one-frame
    // segment. Those crumbs are the repeating hitch on a cached episode.
    "-vf",
    transcodeScaleFilter(opts.maxHeight),
  ];
}

/** Incomplete jobs keep ffmpeg running after pause / player close. */
export function shouldIdleStopFfmpeg(opts: {
  viewerActive: boolean;
  ffmpegRunning: boolean;
  playlistComplete: boolean;
}): boolean {
  if (opts.viewerActive || !opts.ffmpegRunning) return false;
  return opts.playlistComplete;
}

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
