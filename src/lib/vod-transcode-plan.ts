/** How ffmpeg should treat an upstream VOD file after ffprobe. */
export type VodTranscodePlanMode = "copy" | "copyVideo" | "transcode";

export type VodTranscodePlan = {
  mode: VodTranscodePlanMode;
  /** Target max height when re-encoding video (transcode mode). */
  maxHeight: number;
};

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
  /** Output rate, e.g. "24000/1001". Omitted only when the source rate is unknown. */
  frameRate?: string | null;
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
    "-fps_mode",
    "cfr",
    ...(opts.frameRate ? ["-r", opts.frameRate] : []),
    "-g",
    String(opts.gop),
    "-keyint_min",
    String(opts.gop),
    "-sc_threshold",
    "0",
    // Keep the GOP lock inside x264-params. A params string placed before -g
    // is applied again at encoder open and restores scene-cut keyframes, which
    // splits a 4s segment into a one- or two-frame crumb. Do not also pass
    // force_key_frames: that inserts a second keyframe one frame early.
    "-x264-params",
    `cabac=1:bframes=0:ref=1:8x8dct=0:open-gop=0:scenecut=0:keyint=${opts.gop}:min-keyint=${opts.gop}`,
    "-vf",
    transcodeScaleFilter(opts.maxHeight),
  ];
}

const NAMED_FRAME_RATES: readonly { fps: number; expr: string }[] = [
  { fps: 24000 / 1001, expr: "24000/1001" },
  { fps: 24, expr: "24" },
  { fps: 25, expr: "25" },
  { fps: 30000 / 1001, expr: "30000/1001" },
  { fps: 30, expr: "30" },
  { fps: 50, expr: "50" },
  { fps: 60000 / 1001, expr: "60000/1001" },
  { fps: 60, expr: "60" },
];

/** ffprobe `avg_frame_rate` / `r_frame_rate`. Rejects 0/0 and impossible rates. */
export function parseFrameRate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.trim();
  const slash = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  const fps = slash
    ? Number(slash[2]) > 0
      ? Number(slash[1]) / Number(slash[2])
      : NaN
    : Number(text);
  if (!Number.isFinite(fps) || fps < 12 || fps > 60) return null;
  return fps;
}

export type SegmentKeyframePlan = {
  /** Closed GOP length. One keyframe, one segment. */
  gop: number;
  /** ffmpeg `-r`. */
  frameRate: string;
  /** `-hls_time`, equal to gop/fps so the cut lands on that keyframe. */
  hlsTimeSec: number;
};

/**
 * Lock the segment cut to a keyframe. A GOP sized for 24fps on a 30fps
 * episode misses the HLS boundary, and the muxer then leaves a hole the
 * browser skips.
 */
export function keyframePlanForFrameRate(
  fps: number | null,
  segmentSec: number
): SegmentKeyframePlan {
  const seg =
    Number.isFinite(segmentSec) && segmentSec >= 2 && segmentSec <= 8
      ? segmentSec
      : 4;
  const snapped = snapFrameRate(fps);
  const gop = Math.max(1, Math.round(snapped.fps * seg));
  return {
    gop,
    frameRate: snapped.expr,
    hlsTimeSec: gop / snapped.fps,
  };
}

function snapFrameRate(fps: number | null): { fps: number; expr: string } {
  if (fps == null) return { fps: 24, expr: "24" };
  let best = NAMED_FRAME_RATES[0]!;
  let bestDist = Infinity;
  for (const rate of NAMED_FRAME_RATES) {
    const dist = Math.abs(rate.fps - fps);
    if (dist < bestDist) {
      best = rate;
      bestDist = dist;
    }
  }
  if (bestDist > 0.5) {
    const rounded = Math.round(fps);
    return { fps: rounded, expr: String(rounded) };
  }
  return best;
}

export function formatHlsTime(sec: number): string {
  const rounded = Math.round(sec * 1_000_000) / 1_000_000;
  return String(rounded);
}

/**
 * Fragmented MP4 with no edit list. MPEG-TS repeats or gaps about a second
 * of picture at every segment, which is the skip. Copying the source into
 * fMP4 held one frame until the next keyframe — the caller re-encodes.
 */
export function fmp4HlsMuxArgs(): string[] {
  return [
    "-hls_segment_type",
    "fmp4",
    "-hls_segment_options",
    "use_editlist=0",
    "-hls_fmp4_init_filename",
    "init.mp4",
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
  _videoCodec: string | null | undefined,
  _audioCodec?: string | null,
  opts?: { maxHeight?: number }
): VodTranscodePlan {
  const maxHeight = opts?.maxHeight ?? 720;
  // Re-encode the picture as well as the audio. A copied stream does not
  // start each segment on a keyframe, so the player holds one frame until
  // the next one. A closed GOP plays straight through, and the audio is
  // stereo AAC.
  return { mode: "transcode", maxHeight };
}
