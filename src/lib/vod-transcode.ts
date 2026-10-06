import "server-only";

import {
  buildManifestFromContiguousDisk,
  contiguousSegmentCount,
  countManifestSegments,
  encodedCoverageSec,
  manifestIsTipOnlyTail,
  manifestNeedsContiguityHeal,
  resumeSeekSecForDiskPrefix,
  shouldRestartFragmentedTranscode,
  shouldForceSourceRefetch,
  sourceSeekLanded,
  hasOrphanSegmentsBeyondPrefix,
  manifestReferencesMissingOrGappedSegments,
  parseExtinfDurationsBySegment,
  cachedTranscodeShouldBeRebuilt,
  encodedLooksFullyComplete,
  prepareManifestForPlayback,
  rewriteTranscodeManifest,
  segmentSequence,
  sumExtinfDurationSec,
  transcodeStartupReady,
  VOD_TRANSCODE_SEGMENT_RE as SEGMENT_RE,
} from "@/lib/vod-transcode-manifest";
import { transcodeManifestWaitMs } from "@/lib/vod-transcode-wait";
import {
  countTfdtBoxes,
  firstSilentTailIndex,
  initDeclaresAudio,
  playlistTimeBeforeSegment,
  readTrackTimescales,
  segmentTimelineStartSec,
  shiftFmp4Timeline,
  timelineShiftSec,
} from "@/lib/vod-transcode-fmp4-timeline";
import {
  fmp4HlsMuxArgs,
  formatHlsTime,
  keyframePlanForFrameRate,
  parseFrameRate,
  planFromProbeCodecs,
  shouldIdleStopFfmpeg,
  transcodeLibx264Args,
  type VodTranscodePlan,
} from "@/lib/vod-transcode-plan";
import {
  ffprobeVideoAndAudioSelectArgs,
  pickBestAudioStreamIndex,
  shouldDeferSilentAudioEncode,
  type ProbedAudioStream,
} from "@/lib/vod-transcode-audio";
import { upstreamIsHlsMediaPlaylist } from "@/lib/vod-transcode-url";
import {
  chapterMarkerResponseHeaders,
  parseFfprobeChapterDump,
  type ParsedVodChapters,
} from "@/lib/vod-chapter-markers";
import {
  sameProviderDownloadSlot,
  warmEncodeHoldsViewerSlot,
  warmWouldStealProviderDownload,
} from "@/lib/vod-next-warm";
import { spawn, type ChildProcess } from "child_process";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { validateVodUpstreamReadable } from "@/lib/vod-transcode-upstream";
import {
  ensureVodSource,
  forceRedownloadVodSource,
  getVodSourceStatus,
  isVodSourceCacheEnabled,
  isVodSourceComplete,
  releaseVodSourceDownload,
  reopenVodSourceIfTruncated,
  touchVodSource,
  vodSourceStartBytes,
  vodSourceEncodeStartBytes,
  waitForVodSourceBytes,
  waitForVodSourceForSeek,
  waitForVodSourceGrowth,
} from "@/lib/vod-source-cache";
import {
  quantizeTranscodeSeekSec,
  shouldReuseTranscodeJobForSeek,
} from "@/lib/vod-transcode-seek-policy";
import {
  diskFreeReserveBytes,
  evictionKeysForPressure,
  filesystemFreeBytes,
  reclaimDiskPressure,
  registerDiskReclaimer,
} from "@/lib/disk-pressure";
import {
  isNoSpaceError,
  transcodeMaxCacheBytes,
} from "@/lib/vod-transcode-disk-cache";

const IPTV_UA_VOD = "VLC/3.0.20 LibVLC/3.0.20";
const MANIFEST_NAME = "index.m3u8";
const FFMPEG_PID_FILE = ".ffmpeg.pid";

function isHttpInput(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

export function isVodTranscodeEnabledServer(): boolean {
  return process.env.STREAM_VOD_TRANSCODE === "1";
}

let resolvedFfmpegBin: string | null = null;

function ffmpegPathCandidates(): string[] {
  const out: string[] = [];
  const configured = process.env.STREAM_FFMPEG_PATH?.trim();
  if (configured) out.push(configured);
  out.push("/usr/bin/ffmpeg", "ffmpeg");
  return [...new Set(out)];
}

function ffmpegPath(): string {
  return resolvedFfmpegBin ?? ffmpegPathCandidates()[0] ?? "ffmpeg";
}

function probeFfmpegBinary(bin: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const p = spawn(bin, ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

async function resolveFfmpegBinary(): Promise<string | null> {
  if (resolvedFfmpegBin) return resolvedFfmpegBin;
  for (const candidate of ffmpegPathCandidates()) {
    if (await probeFfmpegBinary(candidate)) {
      resolvedFfmpegBin = candidate;
      return candidate;
    }
  }
  return null;
}

function cacheRoot(): string {
  return (
    process.env.STREAM_TRANSCODE_CACHE_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "vod-transcode")
  );
}

function x264Preset(): string {
  const raw = process.env.STREAM_TRANSCODE_X264_PRESET?.trim().toLowerCase();
  const allowed = new Set([
    "ultrafast",
    "superfast",
    "veryfast",
    "faster",
    "fast",
  ]);
  return raw && allowed.has(raw) ? raw : "ultrafast";
}

function maxConcurrentJobs(): number {
  const n = parseInt(process.env.STREAM_TRANSCODE_MAX_JOBS ?? "2", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 8) : 2;
}

function waitForPlaylistMs(): number {
  const n = parseInt(process.env.STREAM_TRANSCODE_READY_MS ?? "120000", 10);
  return Number.isFinite(n) && n > 5000 ? n : 120_000;
}

/** Manifest HTTP must not block longer than this — hls.js will retry on 503. */
function manifestHttpWaitMs(): number {
  const n = parseInt(
    process.env.STREAM_TRANSCODE_MANIFEST_WAIT_MS ?? "16000",
    10
  );
  return Number.isFinite(n) && n >= 3000 && n <= 90_000 ? n : 16_000;
}

function hlsSegmentSeconds(): number {
  const n = parseFloat(process.env.STREAM_TRANSCODE_HLS_TIME ?? "4");
  return Number.isFinite(n) && n >= 2 && n <= 8 ? n : 4;
}

function transcodeStallKillMs(): number {
  const n = parseInt(process.env.STREAM_TRANSCODE_STALL_MS ?? "22000", 10);
  return Number.isFinite(n) && n >= 8000 && n <= 120_000 ? n : 22_000;
}

/** Stop ffmpeg when no client has requested segments/manifests for this long. */
function transcodeIdleMs(): number {
  const n = parseInt(process.env.STREAM_TRANSCODE_IDLE_MS ?? "60000", 10);
  return Number.isFinite(n) && n >= 15_000 && n <= 600_000 ? n : 60_000;
}

function transcodeIdleSweepMs(): number {
  const n = parseInt(process.env.STREAM_TRANSCODE_IDLE_SWEEP_MS ?? "15000", 10);
  return Number.isFinite(n) && n >= 5000 && n <= 120_000 ? n : 15_000;
}

function isOsPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function waitForChildExit(
  proc: ChildProcess,
  timeoutMs: number
): Promise<boolean> {
  if (proc.exitCode != null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    timer.unref?.();
    proc.once("exit", () => done(true));
    proc.once("close", () => done(true));
  });
}

const INIT_KEEP_NAME = "init.mp4.keep";

/** Keep the first init segment. A resume ffmpeg replaces init.mp4 and breaks replay. */
async function rememberFmp4Init(dir: string): Promise<void> {
  const keep = path.join(dir, INIT_KEEP_NAME);
  try {
    const keepSt = await fsp.stat(keep);
    if (keepSt.size > 32) return;
  } catch {
    /* no copy yet */
  }
  try {
    const st = await fsp.stat(path.join(dir, "init.mp4"));
    if (st.size > 32) await fsp.copyFile(path.join(dir, "init.mp4"), keep);
  } catch {
    /* init not written yet */
  }
}

async function restoreFmp4Init(dir: string): Promise<void> {
  const init = path.join(dir, "init.mp4");
  try {
    const st = await fsp.stat(init);
    if (st.size > 32) return;
  } catch {
    /* missing */
  }
  try {
    await fsp.copyFile(path.join(dir, INIT_KEEP_NAME), init);
  } catch {
    /* no backup */
  }
}

async function probeSourceVideoPtsAt(
  filePath: string,
  seekSec: number
): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      ffprobeBinary(),
      [
        "-v",
        "error",
        "-read_intervals",
        `${Math.max(0, Math.floor(seekSec))}%+#1`,
        "-select_streams",
        "v:0",
        "-show_entries",
        "packet=pts_time",
        "-of",
        "csv=p=0",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    let out = "";
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* noop */
      }
      resolve(null);
    }, 8_000);
    proc.stdout?.on("data", (c: Buffer) => {
      out += c.toString();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const pts = out
        .split(/\s+/)
        .map((part) => parseFloat(part))
        .find((n) => Number.isFinite(n));
      resolve(pts ?? null);
    });
  });
}
async function killStrayFfmpegForDir(dir: string): Promise<void> {
  const listed = await new Promise<string>((resolve) => {
    const proc = spawn("ps", ["-ax", "-o", "pid=", "-o", "command="], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    proc.stdout?.on("data", (c: Buffer) => {
      out += c.toString();
    });
    proc.on("error", () => resolve(""));
    proc.on("close", () => resolve(out));
  });
  for (const line of listed.split("\n")) {
    if (!line.includes(dir) || !/\bffmpeg\b/.test(line)) continue;
    const pid = parseInt(line.trim().split(/\s+/)[0] ?? "", 10);
    if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

async function fragmentedOutputState(dir: string): Promise<{
  hasInit: boolean;
  hasFirstSegment: boolean;
  segmentCount: number;
}> {
  const onDisk = await listSegmentFiles(dir);
  let hasInit = false;
  try {
    const st = await fsp.stat(path.join(dir, "init.mp4"));
    hasInit = st.size > 32;
  } catch {
    hasInit = false;
  }
  return {
    hasInit,
    hasFirstSegment: onDisk.has("seg_00000.m4s") || onDisk.has("seg_00000.ts"),
    segmentCount: onDisk.size,
  };
}

/** Delete a package that advertises the opening but cannot play it. */
async function discardUnplayableTranscodeOutput(job: TranscodeJob): Promise<void> {
  await stopJobProc(job);
  await killStrayFfmpegForDir(job.dir);
  const names = await fsp.readdir(job.dir).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter(
        (name) =>
          name === "index.m3u8" ||
          name === "init.mp4" ||
          name === "init.mp4.keep" ||
          name === ".ffmpeg.pid" ||
          /^seg_\d+\.(?:ts|m4s)(?:\.tmp)?$/i.test(name)
      )
      .map((name) => fsp.rm(path.join(job.dir, name), { force: true }).catch(() => {}))
  );
}

/**
 * Stop ffmpeg and wait until it is gone before clearing `job.proc`.
 * Prevents dual writers on the same index.m3u8 after stall recovery.
 */
async function stopJobProc(
  job: TranscodeJob,
  opts?: { waitMs?: number }
): Promise<boolean> {
  const proc = job.proc;
  const waitMs = opts?.waitMs ?? 4_000;
  const pidFromProc = proc?.pid;
  let pidFromFile: number | null = null;
  try {
    const raw = await fsp.readFile(path.join(job.dir, FFMPEG_PID_FILE), "utf8");
    const n = parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n > 0) pidFromFile = n;
  } catch {
    /* no lock file */
  }

  const hadProc = !!(proc && proc.exitCode == null);
  if (hadProc && proc) {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* noop */
    }
    const exited = await waitForChildExit(proc, waitMs);
    if (!exited && pidFromProc && isOsPidAlive(pidFromProc)) {
      try {
        process.kill(pidFromProc, "SIGKILL");
      } catch {
        /* noop */
      }
      await waitForChildExit(proc, 1_000);
    }
  }

  const orphanPid =
    pidFromFile &&
    pidFromFile !== pidFromProc &&
    isOsPidAlive(pidFromFile)
      ? pidFromFile
      : null;
  if (orphanPid) {
    try {
      process.kill(orphanPid, "SIGTERM");
    } catch {
      /* noop */
    }
    await new Promise((r) => setTimeout(r, 400));
    if (isOsPidAlive(orphanPid)) {
      try {
        process.kill(orphanPid, "SIGKILL");
      } catch {
        /* noop */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  job.proc = null;
  try {
    await fsp.rm(path.join(job.dir, FFMPEG_PID_FILE), { force: true });
  } catch {
    /* noop */
  }
  return hadProc || orphanPid != null;
}

/** Kill ffmpeg when upstream read stalls but the process stays alive (frozen encode). */
async function maybeRecoverStalledFfmpeg(
  job: TranscodeJob,
  diskCount: number
): Promise<void> {
  const now = Date.now();
  if (diskCount > job.lastSegmentCount) {
    job.lastSegmentCount = diskCount;
    job.lastSegmentGrowthAt = now;
    return;
  }
  if (!job.proc || job.proc.exitCode != null) return;
  if (now - job.lastSegmentGrowthAt < transcodeStallKillMs()) return;
  await stopJobProc(job);
  job.lastSegmentGrowthAt = now;
}

function manifestTextForPlayback(
  raw: string,
  playlistComplete: boolean,
  onDisk: ReadonlySet<string>
): string {
  const source = buildManifestFromContiguousDisk(
    onDisk,
    parseExtinfDurationsBySegment(raw),
    hlsSegmentSeconds(),
    { playlistComplete }
  );
  return prepareManifestForPlayback(source, playlistComplete, onDisk);
}

function transcodeMaxHeight(): number {
  const n = parseInt(process.env.STREAM_TRANSCODE_MAX_HEIGHT ?? "540", 10);
  return Number.isFinite(n) && n >= 360 && n <= 1080 ? n : 540;
}

async function ffmpegAvailable(): Promise<boolean> {
  return (await resolveFfmpegBinary()) != null;
}

function upstreamReferer(upstreamUrl: string): string {
  try {
    const u = new URL(upstreamUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

function ffmpegInputArgs(referer: string): string[] {
  const args = [
    "-probesize",
    "2M",
    "-analyzeduration",
    "750K",
    "-user_agent",
    IPTV_UA_VOD,
  ];
  if (referer) args.push("-headers", `Referer: ${referer}\r\n`);
  return args;
}

function ffprobeInputArgs(
  referer: string,
  fast = false,
  localFile = false
): string[] {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-probesize",
    fast ? "8M" : "16M",
    "-analyzeduration",
    fast ? "4M" : "8M",
  ];
  if (localFile) return args;
  args.push("-user_agent", IPTV_UA_VOD);
  if (referer) args.push("-headers", `Referer: ${referer}\r\n`);
  return args;
}

function ffprobeBinary(): string {
  const configured = process.env.STREAM_FFMPEG_PATH?.trim();
  if (configured) {
    const dir = path.dirname(configured);
    const base = path.basename(configured);
    if (/ffmpeg/i.test(base)) {
      return path.join(dir, base.replace(/ffmpeg/i, "ffprobe"));
    }
  }
  return "ffprobe";
}

type ProbedCodecs = {
  video: string | null;
  audio: string | null;
  audioStreamIndex: number | null;
  audioStreamCount: number;
  frameRate: number | null;
};

/** One ffprobe round-trip — picks the best audio stream index for ffmpeg `-map`. */
async function probeStreamCodecs(input: string): Promise<ProbedCodecs> {
  const local = !isHttpInput(input);
  const referer = local ? "" : upstreamReferer(input);
  const args = [
    ...ffprobeInputArgs(referer, true, local),
    ...ffprobeVideoAndAudioSelectArgs(),
    "-show_entries",
    "stream=index,codec_name,codec_type,channels,avg_frame_rate,r_frame_rate",
    "-of",
    "json",
    input,
  ];

  return new Promise((resolve) => {
    const empty: ProbedCodecs = {
      video: null,
      audio: null,
      audioStreamIndex: null,
      audioStreamCount: 0,
      frameRate: null,
    };
    const proc = spawn(ffprobeBinary(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(empty);
    }, 10_000);
    proc.stdout?.on("data", (c: Buffer) => {
      out += c.toString();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(empty);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out) as {
          streams?: Array<{
            index?: number;
            codec_type?: string;
            codec_name?: string;
            channels?: number;
            avg_frame_rate?: string;
            r_frame_rate?: string;
          }>;
        };
        let video: string | null = null;
        let frameRate: number | null = null;
        const audioStreams: ProbedAudioStream[] = [];
        for (const stream of parsed.streams ?? []) {
          const type = stream.codec_type?.toLowerCase();
          const name = stream.codec_name?.trim() || null;
          const index =
            typeof stream.index === "number" && Number.isFinite(stream.index)
              ? stream.index
              : null;
          if (type === "video" && !video && name) {
            video = name;
            frameRate =
              parseFrameRate(stream.avg_frame_rate) ??
              parseFrameRate(stream.r_frame_rate);
          }
          if (type === "audio" && index != null) {
            audioStreams.push({
              index,
              codec: name,
              channels:
                typeof stream.channels === "number" &&
                Number.isFinite(stream.channels)
                  ? stream.channels
                  : 0,
            });
          }
        }
        const audioStreamIndex = pickBestAudioStreamIndex(audioStreams);
        const picked =
          audioStreamIndex != null
            ? audioStreams.find((s) => s.index === audioStreamIndex)
            : null;
        resolve({
          video,
          audio: picked?.codec ?? null,
          audioStreamIndex,
          audioStreamCount: audioStreams.length,
          frameRate,
        });
      } catch {
        resolve(empty);
      }
    });
  });
}

/** Bump when segment packaging changes. Older caches are discarded on the next play. */
const TRANSCODE_ENCODE_REV = 10;

type JobMeta = {
  plan: VodTranscodePlan;
  durationSec: number | null;
  startOffsetSec?: number;
  audioStreamIndex?: number | null;
  encodeRev?: number;
  /** Source frame rate used to lock each segment to one keyframe. */
  frameRate?: number | null;
  /** How many times we discarded a source that could not be seeked. */
  sourceRefetchCount?: number;
  /** Chapter intro/credits. Absent until a local probe finishes. */
  chapterMarkers?: ParsedVodChapters | null;
  /** True once the local source was complete (or markers were found). */
  chapterProbeComplete?: boolean;
};

async function probeDurationSec(input: string): Promise<number | null> {
  const local = !isHttpInput(input);
  const referer = local ? "" : upstreamReferer(input);
  const args = [
    ...ffprobeInputArgs(referer, false, local),
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    input,
  ];
  return new Promise((resolve) => {
    const proc = spawn(ffprobeBinary(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, 16_000);
    proc.stdout?.on("data", (c: Buffer) => {
      out += c.toString();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) && n > 1 ? n : null);
    });
  });
}

/**
 * Read container chapters from the local source cache only.
 * Never opens a second connection to the provider while ffmpeg is downloading.
 */
function probeLocalChapterMarkers(
  filePath: string,
  durationSec: number | null
): Promise<ParsedVodChapters | null> {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-probesize",
    "2M",
    "-analyzeduration",
    "1M",
    "-show_chapters",
    "-print_format",
    "json",
    filePath,
  ];
  return new Promise((resolve) => {
    const proc = spawn(ffprobeBinary(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, 8_000);
    proc.stdout?.on("data", (c: Buffer) => {
      out += c.toString();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(parseFfprobeChapterDump(JSON.parse(out), durationSec));
      } catch {
        resolve(null);
      }
    });
  });
}

function scheduleVodChapterProbe(job: TranscodeJob): void {
  if (job.chapterProbeState === "running" || job.chapterProbeState === "done") {
    return;
  }
  const now = Date.now();
  if ((job.chapterProbeNotBefore ?? 0) > now) return;
  if (!isVodSourceCacheEnabled()) {
    job.chapterProbeState = "done";
    return;
  }
  job.chapterProbeState = "running";
  void runVodChapterProbe(job);
}

async function runVodChapterProbe(job: TranscodeJob): Promise<void> {
  try {
    const existing = await readJobMeta(job.dir);
    if (existing?.chapterProbeComplete) {
      job.chapterProbeState = "done";
      return;
    }
    const status = await getVodSourceStatus(job.upstream);
    if (!status || isHttpInput(status.path) || status.bytes < 8_000_000) {
      job.chapterProbeState = "idle";
      job.chapterProbeNotBefore = Date.now() + 20_000;
      return;
    }
    if (!status.complete && job.chapterProbeBytes === status.bytes) {
      job.chapterProbeState = "idle";
      job.chapterProbeNotBefore = Date.now() + 30_000;
      return;
    }
    job.chapterProbeBytes = status.bytes;
    const durationSec = job.durationSec ?? existing?.durationSec ?? null;
    const parsed = await probeLocalChapterMarkers(status.path, durationSec);
    const found = !!(parsed?.intro || parsed?.creditsStartSec != null);
    const latest = (await readJobMeta(job.dir)) ??
      existing ?? {
        plan: planFromProbeCodecs(null, null, {
          maxHeight: transcodeMaxHeight(),
        }),
        durationSec,
      };
    if (parsed && found) latest.chapterMarkers = parsed;
    if (status.complete || found) latest.chapterProbeComplete = true;
    if (latest.chapterProbeComplete) {
      await writeJobMeta(job.dir, latest);
      job.chapterProbeState = "done";
      return;
    }
    job.chapterProbeState = "idle";
    job.chapterProbeNotBefore = Date.now() + 45_000;
  } catch {
    job.chapterProbeState = "idle";
    job.chapterProbeNotBefore = Date.now() + 45_000;
  }
}

async function readJobMeta(dir: string): Promise<JobMeta | null> {
  try {
    const raw = await fsp.readFile(path.join(dir, ".meta.json"), "utf8");
    return JSON.parse(raw) as JobMeta;
  } catch {
    return null;
  }
}

async function writeJobMeta(dir: string, meta: JobMeta): Promise<void> {
  try {
    await fsp.writeFile(
      path.join(dir, ".meta.json"),
      JSON.stringify(meta),
      "utf8"
    );
  } catch {
    /* noop */
  }
}

async function resolveProbeInput(job: TranscodeJob): Promise<string> {
  // A downloaded m3u8 is the playlist text, not the episode. Probe the URL.
  if (upstreamIsHlsMediaPlaylist(job.upstream)) return job.upstream;
  if (isVodSourceCacheEnabled()) {
    const st = await getVodSourceStatus(job.upstream);
    if (st && st.bytes >= Math.min(1_000_000, vodSourceStartBytes())) {
      return st.path;
    }
  }
  return job.upstream;
}

async function sourceDownloadComplete(upstream: string): Promise<boolean> {
  if (!isVodSourceCacheEnabled() || upstreamIsHlsMediaPlaylist(upstream)) {
    return true;
  }
  const source = await getVodSourceStatus(upstream);
  return !!source?.complete;
}

type ResolvedJobMeta = JobMeta & { audioDeferred?: boolean };

async function deferIfAudioHidden(
  job: TranscodeJob,
  meta: JobMeta
): Promise<ResolvedJobMeta> {
  if (meta.audioStreamIndex != null) return meta;
  if (upstreamIsHlsMediaPlaylist(job.upstream)) return meta;
  const complete = await sourceDownloadComplete(job.upstream);
  if (
    shouldDeferSilentAudioEncode({
      audioStreamCount: 0,
      sourceComplete: complete,
    })
  ) {
    return { ...meta, audioDeferred: true };
  }
  return meta;
}

async function resolveJobMeta(job: TranscodeJob): Promise<ResolvedJobMeta> {
  const cached = await readJobMeta(job.dir);
  let probeInput = await resolveProbeInput(job);

  // Tiny .partial files often report "no audio" / no video. Wait for a full
  // encode buffer before locking codec meta (even when already on a local path).
  if (
    isVodSourceCacheEnabled() &&
    !upstreamIsHlsMediaPlaylist(job.upstream) &&
    (cached?.audioStreamIndex == null || !cached)
  ) {
    try {
      await waitForVodSourceBytes(
        job.upstream,
        vodSourceEncodeStartBytes(),
        { timeoutMs: 60_000 }
      );
      probeInput = await resolveProbeInput(job);
    } catch {
      /* continue with whatever we have */
    }
  }

  if (cached?.durationSec && cached.durationSec > 0) {
    // Refresh audio mapping from local source when prior probe failed on HTTP.
    if (
      (cached.audioStreamIndex == null || cached.audioStreamIndex === undefined) &&
      !isHttpInput(probeInput)
    ) {
      const probed = await probeStreamCodecs(probeInput);
      if (probed.audioStreamIndex != null) {
        cached.audioStreamIndex = probed.audioStreamIndex;
        if (probed.video || probed.audio) {
          cached.plan = planFromProbeCodecs(probed.video, probed.audio, {
            maxHeight: transcodeMaxHeight(),
          });
        }
        await writeJobMeta(job.dir, cached);
      }
    }
    return deferIfAudioHidden(job, cached);
  }
  if (cached && cached.durationSec == null) {
    const durationSec = await probeDurationSec(probeInput);
    if (durationSec) {
      cached.durationSec = durationSec;
      job.durationSec = durationSec;
      await writeJobMeta(job.dir, cached);
    }
    // Still try to fill a missing audio index from local bytes.
    if (
      (cached.audioStreamIndex == null || cached.audioStreamIndex === undefined) &&
      !isHttpInput(probeInput)
    ) {
      const probed = await probeStreamCodecs(probeInput);
      if (probed.audioStreamIndex != null) {
        cached.audioStreamIndex = probed.audioStreamIndex;
        await writeJobMeta(job.dir, cached);
      }
    }
    return deferIfAudioHidden(job, cached);
  }

  const {
    video: videoCodec,
    audio: audioCodec,
    audioStreamIndex,
    audioStreamCount,
    frameRate,
  } = await probeStreamCodecs(probeInput);
  const plan = planFromProbeCodecs(videoCodec, audioCodec, {
    maxHeight: transcodeMaxHeight(),
  });
  if (audioStreamCount === 0 && !upstreamIsHlsMediaPlaylist(job.upstream)) {
    const complete = await sourceDownloadComplete(job.upstream);
    // A partial MP4/MKV hides the audio header. Do not start ffmpeg, and do
    // not cache "no audio", until the download has finished.
    if (
      shouldDeferSilentAudioEncode({
        audioStreamCount,
        sourceComplete: complete,
      })
    ) {
      return {
        plan,
        durationSec: null,
        startOffsetSec: job.startOffsetSec,
        audioStreamIndex: null,
        encodeRev: TRANSCODE_ENCODE_REV,
        frameRate,
        audioDeferred: true,
      };
    }
    console.warn(
      `[vod-transcode] no audio streams in upstream (key=${job.key})`
    );
  } else if (audioStreamIndex == null && audioStreamCount === 0) {
    /* HLS playlists are mapped by ffmpeg; a short probe can miss the track. */
  } else if (audioStreamIndex == null) {
    console.warn(
      `[vod-transcode] could not pick audio stream (key=${job.key}, tracks=${audioStreamCount})`
    );
  } else if (audioStreamCount > 1) {
    console.warn(
      `[vod-transcode] mapped audio stream index ${audioStreamIndex} of ${audioStreamCount} track(s) (key=${job.key})`
    );
  }
  const meta: JobMeta = {
    plan,
    durationSec: null,
    startOffsetSec: job.startOffsetSec,
    audioStreamIndex,
    encodeRev: TRANSCODE_ENCODE_REV,
    frameRate,
  };
  await writeJobMeta(job.dir, meta);

  void probeDurationSec(probeInput).then(async (durationSec) => {
    if (durationSec == null) return;
    job.durationSec = durationSec;
    const latest = (await readJobMeta(job.dir)) ?? meta;
    latest.durationSec = durationSec;
    await writeJobMeta(job.dir, latest);
  });

  return meta;
}

type JobState = "starting" | "queued" | "running" | "ready" | "failed";

type TranscodeJob = {
  key: string;
  upstream: string;
  dir: string;
  proc: ChildProcess | null;
  state: JobState;
  error?: string;
  durationSec: number | null;
  startOffsetSec: number;
  waiters: Array<(ok: boolean) => void>;
  /** Contiguous segment count last time we checked encode progress. */
  lastSegmentCount: number;
  /** When `lastSegmentCount` last increased (stall detection). */
  lastSegmentGrowthAt: number;
  /** Last manifest/segment GET from a player (0 = explicitly released). */
  lastViewerAt: number;
  /** Real playback requested the manifest — not a credits-card warm. */
  hasPlayerViewer?: boolean;
  /** The downloaded file ends before the episode does. Do not seek into the hole. */
  sourceGaveOut?: boolean;
  /** Started from the next-episode card. Abandoned warms must not stop a real play. */
  backgroundWarm?: boolean;
  chapterProbeState?: "idle" | "running" | "done";
  chapterProbeNotBefore?: number;
  chapterProbeBytes?: number;
  /** Segment index through which audio tracks have been checked. */
  audioScanThrough?: number;
};

const jobs = new Map<string, TranscodeJob>();
let idleSweepTimer: ReturnType<typeof setInterval> | null = null;
let diskSweepTimer: ReturnType<typeof setInterval> | null = null;
const DISK_SWEEP_MS = 60_000;

function jobViewerActive(job: TranscodeJob): boolean {
  const at = job.lastViewerAt;
  if (at <= 0) return false;
  return Date.now() - at < transcodeIdleMs();
}

function touchTranscodeViewerByUpstream(
  upstream: string,
  startOffsetSec: number
): void {
  const key = cacheKeyForUpstream(
    upstream,
    quantizeTranscodeSeekSec(startOffsetSec)
  );
  const job = jobs.get(key);
  if (job) {
    job.lastViewerAt = Date.now();
    job.hasPlayerViewer = true;
    job.backgroundWarm = false;
  }
  // Tip seeks often reuse the from-0 job — keep that viewer warm too.
  if (startOffsetSec > 0) {
    const base = jobs.get(cacheKeyForUpstream(upstream, 0));
    if (base) {
      base.lastViewerAt = Date.now();
      base.hasPlayerViewer = true;
      base.backgroundWarm = false;
    }
  }
  ensureIdleSweepRunning();
}

function noteTranscodeViewer(job: TranscodeJob): void {
  job.lastViewerAt = Date.now();
  job.hasPlayerViewer = true;
  job.backgroundWarm = false;
  touchVodSource(job.upstream);
  ensureIdleSweepRunning();
}

function ensureIdleSweepRunning(): void {
  if (idleSweepTimer) return;
  idleSweepTimer = setInterval(() => {
    void sweepIdleTranscodeJobs();
  }, transcodeIdleSweepMs());
  idleSweepTimer.unref?.();
  ensureDiskSweepRunning();
}

function ensureDiskSweepRunning(): void {
  if (diskSweepTimer) return;
  diskSweepTimer = setInterval(() => {
    void sweepTranscodeDiskCache();
  }, DISK_SWEEP_MS);
  diskSweepTimer.unref?.();
  void sweepTranscodeDiskCache();
}

/** Start HLS cache LRU + idle ffmpeg stop. Safe to call more than once. */
export function startTranscodeCacheMaintenance(): void {
  if (!isVodTranscodeEnabledServer()) return;
  ensureIdleSweepRunning();
}

async function mkdirTranscodeDir(dir: string): Promise<void> {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch (err) {
    if (!isNoSpaceError(err)) throw err;
    await reclaimDiskPressure();
    await fsp.mkdir(dir, { recursive: true });
  }
}

async function transcodeDirSizeBytes(dir: string): Promise<number> {
  try {
    const names = await fsp.readdir(dir);
    let total = 0;
    for (const name of names) {
      try {
        const st = await fsp.stat(path.join(dir, name));
        if (st.isFile()) total += st.size;
      } catch {
        /* skip */
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function sweepTranscodeDiskCache(): Promise<void> {
  const root = cacheRoot();
  const maxBytes = transcodeMaxCacheBytes();
  let names: string[];
  try {
    names = await fsp.readdir(root);
  } catch {
    return;
  }

  const dirs: Array<{
    key: string;
    bytes: number;
    mtimeMs: number;
  }> = [];
  let usedBytes = 0;
  for (const name of names) {
    const dir = path.join(root, name);
    try {
      const st = await fsp.stat(dir);
      if (!st.isDirectory()) continue;
      const bytes = await transcodeDirSizeBytes(dir);
      dirs.push({ key: name, bytes, mtimeMs: st.mtimeMs });
      usedBytes += bytes;
    } catch {
      /* skip */
    }
  }
  // Only a live ffmpeg is protected. Viewer-warm dirs used to be kept past the
  // cap, which let HLS cache plus source files fill the volume.
  const protectKeys = new Set<string>();
  for (const [key, job] of jobs) {
    if (job.proc && job.proc.exitCode == null) protectKeys.add(key);
  }

  const victims = evictionKeysForPressure({
    files: dirs,
    usedBytes,
    maxBytes,
    freeBytes: await filesystemFreeBytes(root),
    reserveBytes: diskFreeReserveBytes(),
    protectKeys,
  });
  for (const key of victims) {
    await wipeTranscodeJobDir(path.join(root, key), key);
  }
}

registerDiskReclaimer(sweepTranscodeDiskCache);

function stopTranscodeProcOnly(job: TranscodeJob): boolean {
  if (!job.proc || job.proc.exitCode != null) return false;
  // Fire-and-forget wait — callers that need a hard single-writer barrier use stopJobProc.
  void stopJobProc(job).then(() => {
    if (job.state === "running" || job.state === "starting") {
      job.state = "ready";
    }
    drainTranscodeQueue();
  });
  return true;
}

async function sweepIdleTranscodeJobs(): Promise<void> {
  for (const job of jobs.values()) {
    if (!job.proc || job.proc.exitCode != null) continue;
    let playlistComplete = false;
    try {
      const raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
      playlistComplete = await isPlaylistFullyEncoded(job, raw);
    } catch {
      playlistComplete = false;
    }
    if (
      !shouldIdleStopFfmpeg({
        viewerActive: jobViewerActive(job),
        ffmpegRunning: true,
        playlistComplete,
      })
    ) {
      continue;
    }
    stopTranscodeProcOnly(job);
  }
}

/** Pause / close: keep ffmpeg + source download so the encode can finish. */
export function releaseVodTranscodeJobs(upstream: string): number {
  let n = 0;
  for (const job of jobs.values()) {
    if (job.upstream !== upstream) continue;
    job.lastViewerAt = 0;
    job.backgroundWarm = false;
    job.hasPlayerViewer = true;
    n += 1;
  }
  return n;
}

/**
 * Drop a next-episode warm the viewer dismissed. Real playback clears
 * `backgroundWarm`, so this does not stop an episode that already started.
 */
export function abandonVodTranscodeWarm(upstream: string): boolean {
  let abandoned = false;
  for (const job of jobs.values()) {
    if (job.upstream !== upstream || !job.backgroundWarm) continue;
    job.backgroundWarm = false;
    job.lastViewerAt = 0;
    stopTranscodeProcOnly(job);
    abandoned = true;
  }
  if (abandoned) releaseVodSourceDownload(upstream);
  return abandoned;
}

/** True when a HEAD warm would open a second provider download. */
async function warmBlocksOnActiveDownload(nextUpstream: string): Promise<boolean> {
  for (const job of jobs.values()) {
    if (job.upstream === nextUpstream) continue;
    if (!sameProviderDownloadSlot(job.upstream, nextUpstream)) continue;
    if (!jobViewerActive(job) && !job.hasPlayerViewer) continue;
    let otherSourceComplete: boolean | null = null;
    if (isVodSourceCacheEnabled()) {
      const st = await getVodSourceStatus(job.upstream);
      otherSourceComplete = st?.complete === true;
    }
    if (
      warmWouldStealProviderDownload({
        otherViewerActive: true,
        otherSourceComplete,
        otherFfmpegRunning: !!(job.proc && job.proc.exitCode == null),
      })
    ) {
      return true;
    }
  }
  return false;
}

/** Free a slot by stopping the oldest encode that has no viewer. Cache stays on disk. */
async function evictIdleTranscodeSlot(
  exceptKey?: string
): Promise<boolean> {
  let oldest: TranscodeJob | null = null;
  for (const job of jobs.values()) {
    if (exceptKey && job.key === exceptKey) continue;
    if (!job.proc || job.proc.exitCode != null) continue;
    if (
      warmEncodeHoldsViewerSlot({
        backgroundWarm: !!job.backgroundWarm,
        hasPlayerViewer: !!job.hasPlayerViewer,
        lastViewerAt: job.lastViewerAt,
        now: Date.now(),
        idleMs: transcodeIdleMs(),
      })
    ) {
      continue;
    }
    if (!oldest || job.lastViewerAt < oldest.lastViewerAt) oldest = job;
  }
  if (!oldest) return false;
  await stopJobProc(oldest);
  if (oldest.state === "running" || oldest.state === "starting") {
    oldest.state = "ready";
  }
  return true;
}

async function maybeEvictForSlot(
  job: TranscodeJob,
  force = false
): Promise<void> {
  if (activeTranscodeCount() < maxConcurrentJobs()) return;
  if (!force && !jobViewerActive(job)) return;
  await evictIdleTranscodeSlot(job.key);
}
/** One in-flight ensureJob per cache key — prevents duplicate ffmpeg on the same output dir. */
const ensureJobInflight = new Map<string, Promise<TranscodeJob>>();
/** Prevents duplicate ffmpeg spawns when ensureEncodingContinues races. */
const beginTranscodeInflight = new Set<string>();
/** Serialize spawn per job — concurrent callers used to orphan multiple ffmpeg on one dir. */
const spawnFfmpegInflight = new Set<string>();

function activeTranscodeCount(): number {
  let n = 0;
  for (const job of jobs.values()) {
    if (job.proc && job.proc.exitCode == null) n += 1;
  }
  return n;
}

function drainTranscodeQueue(): void {
  const queued = [...jobs.values()].find((j) => j.state === "queued");
  if (!queued) return;
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    void evictIdleTranscodeSlot(queued.key).then((freed) => {
      if (!freed) return;
      drainTranscodeQueue();
    });
    return;
  }
  queued.state = "starting";
  void beginTranscodeJob(queued);
}

/** Bump suffix when transcode output format changes (invalidates stale cache). */
const CACHE_KEY_SUFFIX = "|v9-hscale";

function cacheKeyForUpstream(upstream: string, startOffsetSec = 0): string {
  const off = Math.max(0, Math.floor(startOffsetSec));
  return crypto
    .createHash("sha256")
    .update(upstream + CACHE_KEY_SUFFIX + `|o${off}`)
    .digest("hex")
    .slice(0, 32);
}

function jobDir(key: string): string {
  return path.join(cacheRoot(), key);
}

function upstreamLooksLikeVod(upstreamUrl: URL): boolean {
  const p = upstreamUrl.pathname.toLowerCase();
  if (p.includes("/live/")) return false;
  return (
    p.includes("/movie/") ||
    p.includes("/series/") ||
    /\.(mkv|avi|mp4|mov|wmv|flv|ts|m2ts|mpeg|mpg|webm)($|\?)/i.test(p)
  );
}

export function upstreamEligibleForVodTranscode(upstream: string): boolean {
  try {
    const u = new URL(upstream);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return upstreamLooksLikeVod(u);
  } catch {
    return false;
  }
}

function playlistHasSegments(text: string): boolean {
  return text.split(/\r?\n/).some((line) => {
    const t = line.trim();
    return t && !t.startsWith("#") && SEGMENT_RE.test(t.split("/").pop() || t);
  });
}

async function vodSourceProgressHeaders(
  upstream: string
): Promise<Record<string, string>> {
  if (!isVodSourceCacheEnabled()) return {};
  const st = await getVodSourceStatus(upstream);
  if (!st) return {};
  return { "x-vod-source-pct": String(st.pct) };
}

function mergeHeaders(
  ...parts: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const p of parts) {
    if (!p) continue;
    Object.assign(out, p);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const SEGMENT_CACHE_CONTROL = "public, max-age=86400, immutable";

function transcodeMediaContentType(name: string): string {
  if (name.endsWith(".m4s") || name.endsWith(".mp4")) return "video/mp4";
  return "video/mp2t";
}

async function waitForSegmentFile(
  segPath: string,
  maxWaitMs = 12_000
): Promise<boolean> {
  const tmpPath = `${segPath}.tmp`;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      await fsp.access(tmpPath, fs.constants.F_OK);
      await new Promise((r) => setTimeout(r, 80));
      continue;
    } catch {
      /* no temp file — segment rename finished */
    }
    try {
      const st = await fsp.stat(segPath);
      if (st.size >= 800) return true;
    } catch {
      /* not flushed yet */
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  try {
    const st = await fsp.stat(segPath);
    return st.size >= 800;
  } catch {
    return false;
  }
}

async function listSegmentFiles(dir: string): Promise<Set<string>> {
  try {
    const files = await fsp.readdir(dir);
    const out = new Set<string>();
    // Skip empty/partial tips (0-byte seg after SIGTERM) so resume prefix is playable.
    await Promise.all(
      files
        .filter((f) => SEGMENT_RE.test(f))
        .map(async (f) => {
          try {
            const st = await fsp.stat(path.join(dir, f));
            if (st.size >= 800) out.add(f);
          } catch {
            /* raced with delete */
          }
        })
    );
    return out;
  } catch {
    return new Set();
  }
}

async function isPlaylistFullyEncoded(
  job: TranscodeJob,
  raw: string
): Promise<boolean> {
  const onDisk = await listSegmentFiles(job.dir);
  const encoded = encodedCoverageSec({
    manifestText: raw,
    onDisk,
    segmentSec: hlsSegmentSeconds(),
  });
  // Tip-only ENDLIST is never "complete" while earlier segments exist on disk.
  if (manifestIsTipOnlyTail(raw, onDisk)) return false;
  if (!encodedLooksFullyComplete(encoded, job.durationSec)) return false;
  if (isVodSourceCacheEnabled() && !(await isVodSourceComplete(job.upstream))) {
    return false;
  }
  return true;
}

/** Drop premature ENDLIST so append_list resume can continue encoding. */
async function stripEndlistFromDiskManifest(dir: string): Promise<void> {
  const manifestPath = path.join(dir, MANIFEST_NAME);
  try {
    const raw = await fsp.readFile(manifestPath, "utf8");
    if (!/#EXT-X-ENDLIST/i.test(raw)) return;
    const next = raw
      .split(/\r?\n/)
      .filter((l) => !/^#EXT-X-ENDLIST/i.test(l.trim()))
      .join("\n");
    await fsp.writeFile(manifestPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
  } catch {
    /* missing / racing */
  }
}

/** Drop orphan seg_00058+ files and rewrite index.m3u8 to a contiguous prefix. */
async function healTranscodeJobContiguity(job: TranscodeJob): Promise<number> {
  const dir = job.dir;
  const onDisk = await listSegmentFiles(dir);
  const prefixCount = contiguousSegmentCount(onDisk);
  if (prefixCount === 0) return 0;

  const lastSeq = prefixCount - 1;
  for (const name of onDisk) {
    const m = /^seg_(\d+)\.(?:ts|m4s)$/.exec(name);
    if (!m) continue;
    if (parseInt(m[1]!, 10) > lastSeq) {
      await fsp.rm(path.join(dir, name), { force: true }).catch(() => {});
    }
  }

  const healedDisk = new Set(
    [...onDisk].filter((f) => {
      const m = /^seg_(\d+)\.(?:ts|m4s)$/.exec(f);
      return m && parseInt(m[1]!, 10) <= lastSeq;
    })
  );

  try {
    let durationBySegment = new Map<string, number>();
    try {
      const raw = await fsp.readFile(path.join(dir, MANIFEST_NAME), "utf8");
      durationBySegment = parseExtinfDurationsBySegment(raw);
    } catch {
      /* fresh dir */
    }
    const durationSec =
      job.durationSec ?? (await readJobMeta(job.dir))?.durationSec ?? null;
    const diskEncoded = prefixCount * hlsSegmentSeconds();
    let playlistComplete = encodedLooksFullyComplete(diskEncoded, durationSec);
    if (
      playlistComplete &&
      isVodSourceCacheEnabled() &&
      !(await isVodSourceComplete(job.upstream))
    ) {
      playlistComplete = false;
    }
    const healed = buildManifestFromContiguousDisk(
      healedDisk,
      durationBySegment,
      hlsSegmentSeconds(),
      { playlistComplete }
    );
    await fsp.writeFile(path.join(dir, MANIFEST_NAME), healed, "utf8");
  } catch {
    /* manifest will be rebuilt on next encode */
  }

  return prefixCount;
}

/**
 * ffmpeg `append_list` can continue at seg_00058 while seg_00029..57 are missing,
 * freezing the player ~2 minutes in. Kill a bad encode and heal before resuming.
 */
async function ensureTranscodeJobContiguous(job: TranscodeJob): Promise<number> {
  const onDisk = await listSegmentFiles(job.dir);
  const prefix = contiguousSegmentCount(onDisk);
  if (prefix === 0) return 0;

  let manifestDiskGap = false;
  let manifestEmpty = false;
  let tipOnlyTail = false;
  try {
    const raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
    manifestEmpty = manifestNeedsContiguityHeal(raw);
    tipOnlyTail = !manifestEmpty && manifestIsTipOnlyTail(raw, onDisk);
    manifestDiskGap =
      !manifestEmpty &&
      !tipOnlyTail &&
      manifestReferencesMissingOrGappedSegments(raw, onDisk);
  } catch {
    manifestEmpty = true;
  }

  const needsHeal =
    hasOrphanSegmentsBeyondPrefix(onDisk) ||
    manifestDiskGap ||
    manifestEmpty ||
    tipOnlyTail;
  if (!needsHeal) return prefix;

  // An empty playlist while ffmpeg is still writing is the temp_file window,
  // not a broken encode. Killing it here left seg_00000 on disk and a 0-byte
  // index.m3u8, and every later play returned 503. Serve from the segments.
  const encoderLive = !!(job.proc && job.proc.exitCode == null);
  if (
    encoderLive &&
    (tipOnlyTail ||
      (manifestEmpty &&
        !manifestDiskGap &&
        !hasOrphanSegmentsBeyondPrefix(onDisk)))
  ) {
    return prefix;
  }

  if (job.proc && job.proc.exitCode == null) {
    // PID-file aware stop — raw SIGTERM left orphans writing during heal.
    await stopJobProc(job);
    if (job.state === "running" || job.state === "starting") {
      job.state = "ready";
    }
    drainTranscodeQueue();
  }

  return healTranscodeJobContiguity(job);
}

const resumeInflight = new Map<string, Promise<void>>();

async function resumeTranscodeJob(job: TranscodeJob): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;
  // Stall recovery used to SIGTERM and clear job.proc without waiting — orphans
  // kept writing while a resume ffmpeg started on the same index.m3u8.
  await stopJobProc(job);
  await maybeEvictForSlot(job);
  try {
    if (isVodSourceCacheEnabled()) {
      const st = await getVodSourceStatus(job.upstream);
      if (st && !st.complete) {
        ensureVodSource(job.upstream);
        await waitForVodSourceGrowth(job.upstream, st.bytes, {
          timeoutMs: 90_000,
        });
      }
    }
    const playlistText = await fsp
      .readFile(path.join(job.dir, MANIFEST_NAME), "utf8")
      .catch(() => "");
    const packaged = await fragmentedOutputState(job.dir);
    if (
      shouldRestartFragmentedTranscode({
        playlistText,
        ...packaged,
        ffmpegRunning: false,
      })
    ) {
      await discardUnplayableTranscodeOutput(job);
      void beginTranscodeJob(job);
      return;
    }
    const prefixCount = await ensureTranscodeJobContiguous(job);
    if (prefixCount === 0) {
      await discardUnplayableTranscodeOutput(job);
      void beginTranscodeJob(job);
      return;
    }
    // Force a contiguous MEDIA-SEQUENCE:0 playlist before append_list resume.
    await healTranscodeJobContiguity(job);
    // Heal may write ENDLIST at the completeness floor — strip before append_list.
    await stripEndlistFromDiskManifest(job.dir);
    const meta = await resolveJobMeta(job);
    if (meta.audioDeferred) return;
    job.durationSec = meta.durationSec ?? job.durationSec;
    const raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
    const onDisk = await listSegmentFiles(job.dir);
    const trimmed = prepareManifestForPlayback(raw, false, onDisk);
    const prefixForSeek = contiguousSegmentCount(onDisk);
    const seekInSourceSec = resumeSeekSecForDiskPrefix({
      startOffsetSec: job.startOffsetSec,
      prefixCount: prefixForSeek,
      segmentSec: hlsSegmentSeconds(),
      manifestEncodedSec: sumExtinfDurationSec(trimmed),
    });
    if (seekInSourceSec > 30 && isVodSourceCacheEnabled()) {
      const source = await getVodSourceStatus(job.upstream);
      if (source?.complete && source.path) {
        const landedPts = await probeSourceVideoPtsAt(
          source.path,
          seekInSourceSec
        );
        const refetchCount = meta.sourceRefetchCount ?? 0;
        if (
          shouldForceSourceRefetch({
            seekSec: seekInSourceSec,
            landedPtsSec: landedPts,
            refetchCount,
          })
        ) {
          meta.sourceRefetchCount = refetchCount + 1;
          await writeJobMeta(job.dir, meta);
          await forceRedownloadVodSource(job.upstream);
          await waitForVodSourceForSeek(job.upstream, seekInSourceSec, {
            durationSec: job.durationSec ?? meta.durationSec,
            timeoutMs: Math.min(
              600_000,
              Math.max(
                waitForPlaylistMs(),
                Math.floor(seekInSourceSec) * 2_500 + 120_000
              )
            ),
          }).catch(() => {});
          const again = await getVodSourceStatus(job.upstream);
          const againPts =
            again?.complete && again.path
              ? await probeSourceVideoPtsAt(again.path, seekInSourceSec)
              : null;
          if (!sourceSeekLanded(seekInSourceSec, againPts)) {
            job.sourceGaveOut = true;
            job.state = "failed";
            job.error =
              "This episode's file from your provider is incomplete, so playback stops partway through.";
            notifyWaiters(job, false);
            return;
          }
        } else if (
          refetchCount >= 1 &&
          !sourceSeekLanded(seekInSourceSec, landedPts)
        ) {
          job.sourceGaveOut = true;
          job.state = "failed";
          job.error =
            "This episode's file from your provider is incomplete, so playback stops partway through.";
          notifyWaiters(job, false);
          return;
        }
      }
    }
    if (isVodSourceCacheEnabled() && seekInSourceSec > 0) {
      await waitForVodSourceForSeek(job.upstream, seekInSourceSec, {
        durationSec: job.durationSec ?? meta.durationSec,
        timeoutMs: Math.min(
          600_000,
          Math.max(waitForPlaylistMs(), Math.floor(seekInSourceSec) * 2_500 + 120_000)
        ),
      });
    }
    // Re-check after awaits — another path may have started encoding.
    if (job.proc && job.proc.exitCode == null) return;
    await stripEndlistFromDiskManifest(job.dir);
    const prefixNow = contiguousSegmentCount(await listSegmentFiles(job.dir));
    await spawnFfmpeg(
      job,
      meta.plan,
      {
        seekInSourceSec,
        startSegmentNumber: prefixNow,
      },
      meta.audioStreamIndex,
      meta.frameRate
    );
  } catch (err) {
    job.state = "failed";
    job.error =
      err instanceof Error ? err.message : "Could not resume transcode.";
    notifyWaiters(job, false);
  }
}

/** Keep ffmpeg running until the full episode is encoded (pause / close included). */
async function ensureEncodingContinues(job: TranscodeJob): Promise<void> {
  if (job.sourceGaveOut) return;
  await dropSilentTranscodeTail(job);
  if (job.proc && job.proc.exitCode == null) return;

  let raw: string | null = null;
  try {
    raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
  } catch {
    if (job.state === "failed") {
      job.state = "starting";
      job.error = undefined;
    }
    void beginTranscodeJob(job);
    return;
  }

  if (job.state === "failed") {
    job.state = "ready";
    job.error = undefined;
  }

  if (await isPlaylistFullyEncoded(job, raw)) return;

  const packaged = await fragmentedOutputState(job.dir);
  if (
    shouldRestartFragmentedTranscode({
      playlistText: raw,
      ...packaged,
      ffmpegRunning: false,
    })
  ) {
    await discardUnplayableTranscodeOutput(job);
    void beginTranscodeJob(job);
    return;
  }

  const inflight = resumeInflight.get(job.key);
  if (inflight) {
    await inflight.catch(() => {});
    return;
  }

  const promise = resumeTranscodeJob(job);
  resumeInflight.set(job.key, promise);
  try {
    await promise;
  } finally {
    if (resumeInflight.get(job.key) === promise) {
      resumeInflight.delete(job.key);
    }
  }
}

async function openingSegmentBytes(dir: string): Promise<number> {
  for (const name of ["seg_00000.ts", "seg_00000.m4s"]) {
    try {
      const st = await fsp.stat(path.join(dir, name));
      if (st.size > 0) return st.size;
    } catch {
      /* try the other container */
    }
  }
  return 0;
}

async function startupSegmentsAreReady(job: TranscodeJob): Promise<boolean> {
  const text = await fsp
    .readFile(path.join(job.dir, MANIFEST_NAME), "utf8")
    .catch(() => null);
  const opening = await openingSegmentBytes(job.dir);
  return transcodeStartupReady({
    manifestText: text,
    openingSegmentBytes: opening,
  });
}

async function readManifestIfReady(dir: string): Promise<string | null> {
  const manifestPath = path.join(dir, MANIFEST_NAME);
  try {
    const text = await fsp.readFile(manifestPath, "utf8");
    if (!text.includes("#EXTM3U") || !playlistHasSegments(text)) return null;
    const onDisk = await listSegmentFiles(dir);
    if (onDisk.size === 0) return null;
    const sorted = [...onDisk].sort();
    const first = sorted[0];
    const st = await fsp.stat(path.join(dir, first));
    if (st.size < 800) return null;
    return text;
  } catch {
    return null;
  }
}

function notifyWaiters(job: TranscodeJob, ok: boolean) {
  const list = job.waiters.splice(0, job.waiters.length);
  for (const fn of list) fn(ok);
}

function finishJob(job: TranscodeJob, ok: boolean, err?: string) {
  job.state = ok ? "ready" : "failed";
  if (err) job.error = err;
  if (job.proc) {
    job.proc = null;
  }
  notifyWaiters(job, ok);
  drainTranscodeQueue();
}

async function inProgressPlaylistHasStartupBuffer(
  job: TranscodeJob,
  manifestText: string
): Promise<boolean> {
  const onDisk = await listSegmentFiles(job.dir);
  const playlistComplete =
    job.proc == null && (await isPlaylistFullyEncoded(job, manifestText));
  if (playlistComplete) return true;
  const trimmed = prepareManifestForPlayback(manifestText, false, onDisk);
  // One published segment is enough to start. Waiting for three meant the
  // player polled 503 until the holdback tail had filled.
  return countManifestSegments(trimmed) >= 1;
}

async function waitForReady(
  job: TranscodeJob,
  signal?: AbortSignal,
  maxWaitMs?: number,
  opts?: { failJobOnTimeout?: boolean }
): Promise<boolean> {
  const existing = await readManifestIfReady(job.dir);
  if (
    (existing && (await inProgressPlaylistHasStartupBuffer(job, existing))) ||
    (await startupSegmentsAreReady(job))
  ) {
    job.state = "ready";
    return true;
  }

  const deadline = Date.now() + (maxWaitMs ?? waitForPlaylistMs());
  while (Date.now() < deadline) {
    const state = job.state;
    if (state === "failed") {
      notifyWaiters(job, false);
      return false;
    }
    if (state === "queued") drainTranscodeQueue();
    if (signal?.aborted) {
      return (
        !!(await readManifestIfReady(job.dir)) ||
        (await startupSegmentsAreReady(job))
      );
    }
    const text = await readManifestIfReady(job.dir);
    if (
      (text && (await inProgressPlaylistHasStartupBuffer(job, text))) ||
      (await startupSegmentsAreReady(job))
    ) {
      job.state = "ready";
      notifyWaiters(job, true);
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const late = await readManifestIfReady(job.dir);
  if (
    (late && (await inProgressPlaylistHasStartupBuffer(job, late))) ||
    (await startupSegmentsAreReady(job))
  ) {
    job.state = "ready";
    notifyWaiters(job, true);
    return true;
  }
  // First fragments exist but not enough for a stable start — caller 503s/retries.
  if (late) return true;
  if (opts?.failJobOnTimeout !== false) {
    job.state = "failed";
    job.error = "Transcode took too long to start.";
    notifyWaiters(job, false);
  }
  return false;
}

/**
 * Drop a resumed stretch that has picture and no audio.
 * Those pieces are duplicated frames from a timestamp offset, and playback
 * freezes on them because the audio track never receives a sample.
 */
async function countSegmentTracks(filePath: string): Promise<number> {
  const fh = await fsp.open(filePath, "r");
  try {
    const buf = Buffer.alloc(256 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return countTfdtBoxes(buf.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }
}

async function dropSilentTranscodeTail(job: TranscodeJob): Promise<void> {
  const initPath = path.join(job.dir, "init.mp4");
  let init: Buffer;
  try {
    init = await fsp.readFile(initPath);
  } catch {
    return;
  }
  if (!initDeclaresAudio(init)) return;
  const onDisk = await listSegmentFiles(job.dir);
  const prefix = contiguousSegmentCount(onDisk);
  const start = Math.max(0, (job.audioScanThrough ?? 0) - 1);
  if (prefix < 2 || start >= prefix - 1) {
    job.audioScanThrough = prefix;
    return;
  }
  const counts: number[] = [];
  for (let i = 0; i < start; i++) counts.push(2);
  let tailAt: number | null = null;
  for (let i = start; i < prefix; i++) {
    const name = `seg_${String(i).padStart(5, "0")}.m4s`;
    if (!onDisk.has(name)) break;
    counts[i] = await countSegmentTracks(path.join(job.dir, name));
    tailAt = firstSilentTailIndex(counts);
    if (tailAt != null) break;
  }
  if (tailAt == null) {
    job.audioScanThrough = prefix;
    return;
  }
  await stopJobProc(job);
  const names = await fsp.readdir(job.dir).catch(() => [] as string[]);
  await Promise.all(
    names.map(async (name) => {
      const seq = segmentSequence(name);
      if (seq == null || seq < tailAt!) return;
      await fsp.rm(path.join(job.dir, name), { force: true }).catch(() => {});
    })
  );
  job.audioScanThrough = tailAt;
  console.info(
    `[vod-transcode] drop silent tail key=${job.key.slice(0, 12)} from=${tailAt}`
  );
  await healTranscodeJobContiguity(job);
  await stripEndlistFromDiskManifest(job.dir);
}

const segmentAlignInflight = new Map<string, Promise<void>>();

/** Put a resumed segment's clock back on the episode, once the file is finished. */
async function alignFmp4SegmentForPlayback(
  dir: string,
  name: string
): Promise<void> {
  const filePath = path.join(dir, name);
  const existing = segmentAlignInflight.get(filePath);
  if (existing) {
    await existing;
    return;
  }
  const run = alignFmp4SegmentOnce(dir, name).finally(() => {
    segmentAlignInflight.delete(filePath);
  });
  segmentAlignInflight.set(filePath, run);
  await run;
}

async function alignFmp4SegmentOnce(dir: string, name: string): Promise<void> {
  const filePath = path.join(dir, name);
  let manifest = "";
  let init: Buffer;
  try {
    [manifest, init] = await Promise.all([
      fsp.readFile(path.join(dir, MANIFEST_NAME), "utf8"),
      fsp.readFile(path.join(dir, "init.mp4")),
    ]);
  } catch {
    return;
  }
  const expected = playlistTimeBeforeSegment(manifest, name);
  if (expected == null) return;
  const timescales = readTrackTimescales(init);
  if (timescales.size === 0) return;
  const fh = await fsp.open(filePath, "r").catch(() => null);
  if (!fh) return;
  let actual: number | null = null;
  try {
    const head = Buffer.alloc(256 * 1024);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    actual = segmentTimelineStartSec(head.subarray(0, bytesRead), timescales);
  } finally {
    await fh.close();
  }
  const shift = actual == null ? 0 : timelineShiftSec(expected, actual);
  if (!(shift > 0)) return;
  const raw = await fsp.readFile(filePath);
  const shifted = shiftFmp4Timeline(raw, shift, timescales);
  const tmp = `${filePath}.align`;
  await fsp.writeFile(tmp, shifted);
  await fsp.rename(tmp, filePath);
}

async function spawnFfmpeg(
  job: TranscodeJob,
  plan: VodTranscodePlan,
  resume?: {
    seekInSourceSec: number;
    startSegmentNumber: number;
  },
  audioStreamIndex?: number | null,
  frameRate?: number | null
): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;
  if (spawnFfmpegInflight.has(job.key)) return;
  await maybeEvictForSlot(job);
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    job.state = "queued";
    return;
  }
  spawnFfmpegInflight.add(job.key);
  try {
    await spawnFfmpegLocked(job, plan, resume, audioStreamIndex, frameRate);
  } finally {
    spawnFfmpegInflight.delete(job.key);
  }
}

async function spawnFfmpegLocked(
  job: TranscodeJob,
  plan: VodTranscodePlan,
  resume?: {
    seekInSourceSec: number;
    startSegmentNumber: number;
  },
  audioStreamIndex?: number | null,
  frameRate?: number | null
): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;
  // Kill orphan writers left after a prior SIGTERM-without-wait.
  await stopJobProc(job);
  await killStrayFfmpegForDir(job.dir);
  await maybeEvictForSlot(job);
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    job.state = "queued";
    return;
  }
  await mkdirTranscodeDir(job.dir);
  // Re-check after await — another caller may have started ffmpeg.
  if (job.proc && job.proc.exitCode == null) return;
  await maybeEvictForSlot(job);
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    job.state = "queued";
    return;
  }

  let inputPath = job.upstream;
  let useLocalSource = false;
  if (
    isVodSourceCacheEnabled() &&
    !upstreamIsHlsMediaPlaylist(job.upstream)
  ) {
    const st = await getVodSourceStatus(job.upstream);
    if (st && st.bytes > 0) {
      inputPath = st.path;
      useLocalSource = true;
      ensureVodSource(job.upstream);
    }
  }

  // Final barrier after source awaits.
  if (job.proc && job.proc.exitCode == null) return;

  const upstreamUrl = job.upstream;
  const refererHost = upstreamReferer(upstreamUrl);
  const segSec = hlsSegmentSeconds();
  const keys = keyframePlanForFrameRate(frameRate ?? null, segSec);
  const seekSec = resume
    ? Math.max(0, resume.seekInSourceSec)
    : Math.max(0, Math.floor(job.startOffsetSec));

  const segPattern = path.join(job.dir, "seg_%05d.m4s");
  const outManifest = path.join(job.dir, MANIFEST_NAME);
  const args = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-fflags",
    "+genpts+discardcorrupt",
    ...(useLocalSource
      ? ["-probesize", "16M", "-analyzeduration", "8M"]
      : ffmpegInputArgs(refererHost)),
    ...(seekSec > 0 ? ["-ss", String(seekSec)] : []),
    "-i",
    inputPath,
    "-map",
    "0:v:0?",
    "-map",
    // Required audio map. The optional `?` form drops the track and still
    // exits 0, which is a silent picture.
    audioStreamIndex != null ? `0:${audioStreamIndex}` : "0:a:0",
  ];

  // Already-TS episode playlists must not be forced through the MP4 annex-B
  // filter; that filter drops or garbles them. MP4/MKV still need it.
  const annexBFilter = upstreamIsHlsMediaPlaylist(upstreamUrl)
    ? []
    : ["-bsf:v", "h264_mp4toannexb"];

  if (plan.mode === "copy") {
    args.push("-c", "copy", ...annexBFilter);
  } else if (plan.mode === "copyVideo") {
    args.push(
      "-c:v",
      "copy",
      ...annexBFilter,
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      "-af",
      "aresample=async=1:first_pts=0"
    );
  } else {
    args.push(
      ...transcodeLibx264Args({
        preset: x264Preset(),
        maxHeight: plan.maxHeight,
        gop: keys.gop,
        frameRate: keys.frameRate,
      }),
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      "-af",
      "aresample=async=1:first_pts=0"
    );
  }

  args.push(
    "-sn",
    "-avoid_negative_ts",
    "make_zero",
    "-max_muxing_queue_size",
    "4096",
    // Default mux delay pads each MPEG-TS segment and leaves a video hole
    // hls.js trips over at every keyframe.
    "-muxdelay",
    "0",
    "-muxpreload",
    "0",
    "-f",
    "hls",
    "-hls_time",
    formatHlsTime(keys.hlsTimeSec),
    "-hls_list_size",
    "0",
    // Always append_list. resumeTranscodeJob heals a contiguous MEDIA-SEQUENCE:0
    // playlist first. Do NOT also pass -start_number: ffmpeg treats it as an
    // offset on append and jumps (e.g. 2078 → seg_04156), leaving a hole that
    // freezes mid-film scrub.
    "-hls_flags",
    "independent_segments+temp_file+append_list",
    // MPEG-TS leaves a video hole at every segment edge. Chrome plays about
    // a second of audio across that hole and the picture jumps. Fragmented
    // MP4 keeps one timeline. Edit lists are off so Chrome does not hold or
    // replay the first frame, and the video is re-encoded so each segment
    // starts on a keyframe.
    ...fmp4HlsMuxArgs(),
    "-hls_segment_filename",
    segPattern,
  );
  args.push(outManifest);

  await rememberFmp4Init(job.dir);
  const proc = spawn(ffmpegPath(), args, {
    stdio: ["ignore", "ignore", "pipe"],
  });
  job.proc = proc;
  job.state = "running";
  if (proc.pid) {
    try {
      await fsp.writeFile(
        path.join(job.dir, FFMPEG_PID_FILE),
        String(proc.pid),
        "utf8"
      );
    } catch {
      /* best-effort lock file */
    }
  }

  let stderr = "";
  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-2000);
  });

  proc.on("error", (err) => {
    finishJob(job, false, err.message || "Failed to start ffmpeg.");
  });

  proc.on("close", (code) => {
    void (async () => {
      job.proc = null;
      try {
        await fsp.rm(path.join(job.dir, FFMPEG_PID_FILE), { force: true });
      } catch {
        /* noop */
      }
      const raw = await readManifestIfReady(job.dir);
      if (!raw) {
        finishJob(
          job,
          false,
          code === 0
            ? "Transcode finished without a playable playlist."
            : stderr.trim().slice(0, 240) ||
                `ffmpeg exited with code ${code ?? "unknown"}`
        );
        return;
      }
      if (await isPlaylistFullyEncoded(job, raw)) {
        finishJob(job, true);
        return;
      }
      job.state = "ready";
      notifyWaiters(job, true);
      // ffmpeg often writes ENDLIST on early EOF even when the movie is far
      // from done — strip it so the next resume/open continues encoding.
      try {
        const live = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
        if (/#EXT-X-ENDLIST/i.test(live)) {
          await fsp.writeFile(
            path.join(job.dir, MANIFEST_NAME),
            live
              .split(/\r?\n/)
              .filter((l) => !/^#EXT-X-ENDLIST/i.test(l.trim()))
              .join("\n"),
            "utf8"
          );
        }
      } catch {
        /* noop */
      }
      if (isVodSourceCacheEnabled()) {
        const encoded = encodedCoverageSec({
          manifestText: raw,
          onDisk: await listSegmentFiles(job.dir),
          segmentSec: hlsSegmentSeconds(),
        });
        await reopenVodSourceIfTruncated(
          job.upstream,
          job.startOffsetSec + encoded,
          job.durationSec
        );
        const st = await getVodSourceStatus(job.upstream);
        if (st && !st.complete) {
          ensureVodSource(job.upstream);
          await waitForVodSourceGrowth(job.upstream, st.bytes, {
            timeoutMs: 90_000,
          }).catch(() => {});
        }
      }
      await ensureTranscodeJobContiguous(job);
      void ensureEncodingContinues(job);
      drainTranscodeQueue();
    })();
  });
}

async function wipeTranscodeJobDir(dir: string, key: string): Promise<void> {
  const job = jobs.get(key);
  if (job) {
    await stopJobProc(job);
  }
  jobs.delete(key);
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

/** Free ffmpeg slots when jumping offsets — never wipe a covering from-0 encode. */
async function cancelSiblingTranscodeJobs(
  upstream: string,
  keepKey: string
): Promise<void> {
  const victims: Array<{ key: string; dir: string }> = [];
  for (const [key, job] of jobs.entries()) {
    if (key === keepKey || job.upstream !== upstream) continue;
    // Keep a from-0 job that already has playable media — scrub jobs must not
    // delete a finished movie encode just because the client sent tc_seek.
    if (job.startOffsetSec === 0) {
      const encoded = await encodedDurationForJob(job);
      if (encoded > 30) continue;
    }
    victims.push({ key, dir: job.dir });
  }
  await Promise.all(
    victims.map(({ key, dir }) => wipeTranscodeJobDir(dir, key))
  );
}

/**
 * One-connection IPTV accounts: only one upstream *download* can succeed at a
 * time. Stop other writers and release their source downloads — but keep HLS
 * segment caches on disk so returning to a half-encoded movie is instant.
 */
async function cancelOtherUpstreamTranscodeJobs(
  upstream: string,
  keepKey: string
): Promise<void> {
  const otherUpstreams = new Set<string>();
  for (const [key, job] of jobs.entries()) {
    if (key === keepKey || job.upstream === upstream) continue;
    otherUpstreams.add(job.upstream);
    job.lastViewerAt = 0;
    stopTranscodeProcOnly(job);
  }
  await Promise.all(
    [...otherUpstreams].map(async (u) => {
      releaseVodSourceDownload(u);
    })
  );
}

async function encodedDurationForJob(job: TranscodeJob): Promise<number> {
  try {
    const onDisk = await listSegmentFiles(job.dir);
    const prefix = contiguousSegmentCount(onDisk);
    const diskFloor = prefix * hlsSegmentSeconds();
    let fromManifest = 0;
    try {
      const raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
      fromManifest = sumExtinfDurationSec(
        prepareManifestForPlayback(raw, false, onDisk)
      );
    } catch {
      /* empty / missing */
    }
    return Math.max(fromManifest, diskFloor);
  } catch {
    return 0;
  }
}

/** Load a job dir from disk into memory after process restart (deploy). */
async function hydrateTranscodeJobFromDisk(
  upstream: string,
  startOffsetSec: number
): Promise<TranscodeJob | null> {
  const off = Math.max(0, Math.floor(startOffsetSec));
  const key = cacheKeyForUpstream(upstream, off);
  const existing = jobs.get(key);
  if (existing) return existing;

  const dir = jobDir(key);
  const cachedMeta = await readJobMeta(dir);
  if (!cachedMeta) return null;
  const metaOff = Math.max(0, Math.floor(cachedMeta.startOffsetSec ?? 0));
  if (metaOff !== off) return null;

  const manifest = await readManifestIfReady(dir);
  const stalePackaging = (cachedMeta.encodeRev ?? 0) !== TRANSCODE_ENCODE_REV;
  if (stalePackaging || (manifest && cachedTranscodeShouldBeRebuilt(manifest))) {
    await wipeTranscodeJobDir(dir, key);
    return null;
  }
  if (!manifest) {
    const onDisk = await listSegmentFiles(dir);
    if (contiguousSegmentCount(onDisk) <= 0) return null;
  }

  const job: TranscodeJob = {
    key,
    upstream,
    dir,
    proc: null,
    state: manifest ? "ready" : "starting",
    durationSec: cachedMeta.durationSec ?? null,
    startOffsetSec: off,
    waiters: [],
    lastSegmentCount: 0,
    lastSegmentGrowthAt: Date.now(),
    lastViewerAt: Date.now(),
  };
  jobs.set(key, job);
  return job;
}

/** Reuse a covering/growing encode instead of forking a parallel seek job. */
async function findReusableTranscodeJob(
  upstream: string,
  seekSec: number
): Promise<TranscodeJob | null> {
  if (seekSec <= 0) return null;

  // After deploy, in-memory jobs are empty — hydrate the from-0 encode and the
  // quantized seek bucket from disk before deciding to fork a new writer.
  const hydrateOffsets = new Set<number>([
    0,
    quantizeTranscodeSeekSec(seekSec),
  ]);
  for (const off of hydrateOffsets) {
    await hydrateTranscodeJobFromDisk(upstream, off);
  }

  let best: TranscodeJob | null = null;
  let bestEncoded = -1;
  for (const job of jobs.values()) {
    if (job.upstream !== upstream) continue;
    if (job.state === "failed") {
      const hasManifest = await readManifestIfReady(job.dir);
      if (!hasManifest) continue;
    }
    const encoded = await encodedDurationForJob(job);
    const procAlive = !!(job.proc && job.proc.exitCode == null);
    if (
      !shouldReuseTranscodeJobForSeek({
        jobStartOffsetSec: job.startOffsetSec,
        encodedSec: encoded,
        seekSec,
        procAlive,
      })
    ) {
      continue;
    }
    // Prefer earlier start offsets (especially a complete from-0 movie).
    const rank = encoded + (job.startOffsetSec === 0 ? 1e9 : 0);
    if (rank > bestEncoded) {
      bestEncoded = rank;
      best = job;
    }
  }
  return best;
}

async function ensureJobLocked(
  upstream: string,
  opts?: { resetCache?: boolean; seekSec?: number; backgroundWarm?: boolean }
): Promise<TranscodeJob> {
  const requestedSeek = Math.max(0, Math.floor(opts?.seekSec ?? 0));

  if (!opts?.resetCache && requestedSeek > 0) {
    const reusable = await findReusableTranscodeJob(upstream, requestedSeek);
    if (reusable) {
      noteTranscodeViewer(reusable);
      void ensureEncodingContinues(reusable);
      return reusable;
    }
  }

  const startOffsetSec = quantizeTranscodeSeekSec(requestedSeek);
  const key = cacheKeyForUpstream(upstream, startOffsetSec);
  const dir = jobDir(key);

  if (startOffsetSec > 0) {
    await cancelSiblingTranscodeJobs(upstream, key);
  } else if (!opts?.backgroundWarm) {
    await cancelOtherUpstreamTranscodeJobs(upstream, key);
  }

  // ensureJob() serializes concurrent callers via ensureJobInflight — do not await
  // that map here or tc_reset deadlocks waiting on the in-flight promise itself.
  if (opts?.resetCache) {
    // Soft reset when we already have real progress — wiping a 1h+ encode on
    // "Try again" is what killed Odyssey mid-watch after the 60m playlist tip.
    const diskBefore = await listSegmentFiles(dir);
    const prefixBefore = contiguousSegmentCount(diskBefore);
    if (prefixBefore * hlsSegmentSeconds() >= 120) {
      let existingSoft = jobs.get(key);
      if (!existingSoft) {
        existingSoft =
          (await hydrateTranscodeJobFromDisk(upstream, startOffsetSec)) ??
          undefined;
      }
      if (existingSoft) {
        await stopJobProc(existingSoft);
        existingSoft.state = "ready";
        existingSoft.error = undefined;
        existingSoft.lastViewerAt = Date.now();
        await ensureTranscodeJobContiguous(existingSoft);
        // Drop premature ENDLIST so encoding can continue — never strip ENDLIST
        // from a fully-encoded from-0 title (that re-arms EVENT live-sync).
        try {
          const rawSoft = await fsp.readFile(
            path.join(existingSoft.dir, MANIFEST_NAME),
            "utf8"
          );
          if (
            rawSoft.includes("#EXT-X-ENDLIST") &&
            !(await isPlaylistFullyEncoded(existingSoft, rawSoft))
          ) {
            await fsp.writeFile(
              path.join(existingSoft.dir, MANIFEST_NAME),
              rawSoft
                .split(/\r?\n/)
                .filter((l) => !/^#EXT-X-ENDLIST/i.test(l.trim()))
                .join("\n"),
              "utf8"
            );
          }
        } catch {
          /* heal/rebuild on continue */
        }
        void ensureEncodingContinues(existingSoft);
        return existingSoft;
      }
    }
    // Wipe HLS segments only — keep the downloaded source so Try again is fast.
    await wipeTranscodeJobDir(dir, key);
  }

  const existing = jobs.get(key);
  if (existing) {
    if (existing.startOffsetSec !== startOffsetSec) {
      await wipeTranscodeJobDir(dir, key);
    } else if (existing.state === "failed") {
      const again = await readManifestIfReady(dir);
      if (again) {
        // Keep flushed segments and resume encode — do not leave a failed job
        // that makes the next playlist poll return 502 mid-episode.
        existing.state = "ready";
        existing.error = undefined;
        void ensureEncodingContinues(existing);
        return existing;
      }
      await wipeTranscodeJobDir(dir, key);
    } else {
      void ensureEncodingContinues(existing);
      return existing;
    }
  }

  // wipeTranscodeJobDir removes the job folder — recreate before ffmpeg writes segments.
  await mkdirTranscodeDir(dir);

  const manifest = await readManifestIfReady(dir);
  const cachedMeta = await readJobMeta(dir);
  const job: TranscodeJob = {
    key,
    upstream,
    dir,
    proc: null,
    state: manifest ? "ready" : "starting",
    durationSec: cachedMeta?.durationSec ?? null,
    startOffsetSec,
    waiters: [],
    lastSegmentCount: 0,
    lastSegmentGrowthAt: Date.now(),
    lastViewerAt: opts?.backgroundWarm ? 0 : Date.now(),
    backgroundWarm: !!opts?.backgroundWarm,
  };
  jobs.set(key, job);
  if (manifest) {
    void ensureEncodingContinues(job);
    return job;
  }

  void beginTranscodeJob(job);
  return job;
}

async function ensureJob(
  upstream: string,
  opts?: { resetCache?: boolean; seekSec?: number; backgroundWarm?: boolean }
): Promise<TranscodeJob> {
  // One flight chain per upstream — tip seeks cannot race a from-0 create and
  // fork a second ffmpeg job before reuse logic sees the first.
  // get→chain→set must stay synchronous so concurrent callers serialize.
  const gateKey = `up:${cacheKeyForUpstream(upstream, 0)}`;
  const prev = ensureJobInflight.get(gateKey);
  const promise = (
    prev ? prev.catch(() => null) : Promise.resolve()
  ).then(() => ensureJobLocked(upstream, opts));
  ensureJobInflight.set(gateKey, promise);
  try {
    return await promise;
  } finally {
    if (ensureJobInflight.get(gateKey) === promise) {
      ensureJobInflight.delete(gateKey);
    }
  }
}

async function beginTranscodeJob(job: TranscodeJob): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;
  if (beginTranscodeInflight.has(job.key)) return;

  const partial = await readManifestIfReady(job.dir);
  if (partial) {
    if (await isPlaylistFullyEncoded(job, partial)) return;
    await ensureEncodingContinues(job);
    return;
  }

  if (job.state === "running" || job.state === "ready") {
    if (await readManifestIfReady(job.dir)) return;
  }

  beginTranscodeInflight.add(job.key);
  try {
    const upstreamErr = await validateVodUpstreamReadable(job.upstream);
    if (upstreamErr) {
      job.state = "failed";
      job.error = upstreamErr;
      notifyWaiters(job, false);
      drainTranscodeQueue();
      return;
    }

    if (
      isVodSourceCacheEnabled() &&
      !upstreamIsHlsMediaPlaylist(job.upstream)
    ) {
      try {
        await waitForVodSourceBytes(job.upstream, vodSourceEncodeStartBytes(), {
          timeoutMs: Math.min(waitForPlaylistMs(), 180_000),
        });
        // Keep downloading ahead of ffmpeg (disk read — frees the IPTV connection).
        ensureVodSource(job.upstream);
      } catch (err) {
        job.state = "failed";
        job.error =
          err instanceof Error
            ? err.message
            : "Could not download this episode for playback.";
        notifyWaiters(job, false);
        drainTranscodeQueue();
        return;
      }
    }

    let meta = await resolveJobMeta(job);
    if (meta.audioDeferred) {
      const deadline = Date.now() + 12_000;
      while (meta.audioDeferred && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        meta = await resolveJobMeta(job);
      }
    }
    if (meta.audioDeferred) {
      // Download is still hiding the audio header. Caller retries; do not
      // start a video-only encode.
      job.state = "starting";
      return;
    }

    if (
      isVodSourceCacheEnabled() &&
      !upstreamIsHlsMediaPlaylist(job.upstream) &&
      job.startOffsetSec > 0
    ) {
      try {
        await waitForVodSourceForSeek(job.upstream, job.startOffsetSec, {
          durationSec: meta.durationSec ?? job.durationSec,
          timeoutMs: Math.min(
            600_000,
            Math.max(
              waitForPlaylistMs(),
              Math.floor(job.startOffsetSec) * 2_500 + 120_000
            )
          ),
        });
        ensureVodSource(job.upstream);
      } catch (err) {
        job.state = "failed";
        job.error =
          err instanceof Error
            ? err.message
            : "Still downloading this episode to the seek point…";
        notifyWaiters(job, false);
        drainTranscodeQueue();
        return;
      }
    }

    const slotWaitMs = Math.min(waitForPlaylistMs(), 180_000);
    let waited = 0;
    let evicted = false;
    while (
      activeTranscodeCount() >= maxConcurrentJobs() &&
      waited < slotWaitMs
    ) {
      if (!evicted) {
        evicted = await evictIdleTranscodeSlot(job.key);
      }
      job.state = "queued";
      await new Promise((r) => setTimeout(r, 400));
      waited += 400;
    }
    if (activeTranscodeCount() >= maxConcurrentJobs()) {
      job.state = "failed";
      job.error =
        "Server is busy preparing other videos. Try again in a moment.";
      notifyWaiters(job, false);
      return;
    }

    job.durationSec = meta.durationSec;
    const plan = meta.plan;
    if (job.state === "failed") return;

    job.state = "starting";
    await spawnFfmpeg(job, plan, undefined, meta.audioStreamIndex, meta.frameRate);
  } catch (err) {
    job.state = "failed";
    job.error =
      err instanceof Error ? err.message : "Could not probe or start transcode.";
    notifyWaiters(job, false);
    drainTranscodeQueue();
  } finally {
    beginTranscodeInflight.delete(job.key);
  }
}

export type VodTranscodeHandleResult = {
  status: number;
  body?: BodyInit | null;
  contentType?: string;
  extraHeaders?: Record<string, string>;
  errorText?: string;
};

export async function handleVodTranscodeRequest(opts: {
  upstream: string;
  media: string | null;
  head: boolean;
  signal?: AbortSignal;
  compatMse: boolean;
  /** Wipe disk cache and restart ffmpeg (client "Try again"). */
  resetCache?: boolean;
  /** Start encoding from this position in the source file (seconds). */
  seekSec?: number;
  /** Chromecast receiver — emit absolute segment URLs in the m3u8. */
  forCast?: boolean;
  proxyOrigin?: string;
}): Promise<VodTranscodeHandleResult> {
  if (!isVodTranscodeEnabledServer()) {
    return {
      status: 503,
      errorText: "VOD transcode is not enabled on this server.",
    };
  }

  if (!upstreamEligibleForVodTranscode(opts.upstream)) {
    return { status: 400, errorText: "URL is not eligible for VOD transcode." };
  }

  if (opts.head && (await warmBlocksOnActiveDownload(opts.upstream))) {
    return {
      status: 202,
      contentType: "application/vnd.apple.mpegurl",
      extraHeaders: { "retry-after": "3" },
    };
  }

  if (!(await ffmpegAvailable())) {
    return {
      status: 503,
      errorText: "ffmpeg is not available on this server.",
    };
  }

  if (!opts.head) {
    touchTranscodeViewerByUpstream(
      opts.upstream,
      Math.max(0, Math.floor(opts.seekSec ?? 0))
    );
    if (!upstreamIsHlsMediaPlaylist(opts.upstream)) {
      touchVodSource(opts.upstream);
    }
    if (
      isVodSourceCacheEnabled() &&
      !upstreamIsHlsMediaPlaylist(opts.upstream)
    ) {
      ensureVodSource(opts.upstream);
    }
  }

  const job = await ensureJob(opts.upstream, {
    resetCache: opts.resetCache,
    seekSec: opts.seekSec,
    backgroundWarm: opts.head && !(opts.seekSec && opts.seekSec > 0),
  });
  if (opts.head && !job.hasPlayerViewer) {
    job.backgroundWarm = true;
    job.lastViewerAt = 0;
  }
  if (!opts.head) {
    noteTranscodeViewer(job);
  }
  const media =
    opts.media && opts.media !== MANIFEST_NAME
      ? path.basename(opts.media)
      : MANIFEST_NAME;

  if (!SEGMENT_RE.test(media) && media !== MANIFEST_NAME && media !== "init.mp4" && media !== INIT_KEEP_NAME) {
    return { status: 400, errorText: "Invalid transcode media." };
  }

  if (media === MANIFEST_NAME) {
    if (!opts.head) {
      console.info(
        `[vod-transcode] play key=${job.key.slice(0, 12)} input=${upstreamIsHlsMediaPlaylist(opts.upstream) ? "playlist" : "file"}`
      );
    }
    scheduleVodChapterProbe(job);
    // Drop a silent resumed stretch before deciding the episode is finished.
    await dropSilentTranscodeTail(job);
    // Contiguity heal is awaited below before serve — do not fire-and-forget
    // a parallel heal that races stop/rewrite with ffmpeg append_list.
    void ensureEncodingContinues(job);
    /** Warm requests (HEAD) must not block — kick ffmpeg and return immediately. */
    if (opts.head) {
      if (
        isVodSourceCacheEnabled() &&
        !upstreamIsHlsMediaPlaylist(opts.upstream)
      ) {
        ensureVodSource(opts.upstream);
      }
      return {
        status: 202,
        contentType: "application/vnd.apple.mpegurl",
        extraHeaders: mergeHeaders(
          { "retry-after": "1" },
          await vodSourceProgressHeaders(opts.upstream)
        ),
      };
    }
    const manifestWait = transcodeManifestWaitMs(opts.seekSec ?? 0, {
      httpWaitMs: manifestHttpWaitMs(),
      playlistWaitMs: waitForPlaylistMs(),
    });
    const ready = await waitForReady(job, opts.signal, manifestWait, {
      failJobOnTimeout: false,
    });
    if (!ready) {
      const sourceHdrs = await vodSourceProgressHeaders(opts.upstream);
      const stillStarting =
        job.state === "starting" ||
        job.state === "running" ||
        job.state === "queued";
      const busy =
        job.state === "queued" ||
        job.error?.includes("busy") ||
        job.error?.includes("Too many");
      if (stillStarting || busy) {
        return {
          status: 503,
          errorText: busy
            ? job.error ||
              "Server is busy preparing other videos. Try again in a moment."
            : "First video segment is still being prepared. Retry in a few seconds.",
          extraHeaders: mergeHeaders(
            { "retry-after": busy ? "3" : "2" },
            sourceHdrs
          ),
        };
      }
      // Transient provider/ffmpeg blips — soft 503 so mid-play clients retry.
      if (job.state === "failed") {
        void ensureEncodingContinues(job);
        return {
          status: 503,
          errorText:
            job.error ||
            "Could not prepare transcoded stream. Retrying encode…",
          extraHeaders: mergeHeaders({ "retry-after": "2" }, sourceHdrs),
        };
      }
      return {
        status: 502,
        errorText: job.error || "Could not prepare transcoded stream.",
        extraHeaders: sourceHdrs,
      };
    }
    let raw: string;
    try {
      raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
    } catch {
      void ensureEncodingContinues(job);
      return {
        status: 503,
        errorText:
          "First video segment is still being prepared. Retry in a few seconds.",
        extraHeaders: mergeHeaders(
          { "retry-after": "2" },
          await vodSourceProgressHeaders(opts.upstream)
        ),
      };
    }
    const jobMeta = await readJobMeta(job.dir);
    const durationSec = job.durationSec ?? jobMeta?.durationSec ?? null;
    if (!durationSec || durationSec <= 0) {
      const probeInput = await resolveProbeInput(job);
      void probeDurationSec(probeInput).then(async (probed) => {
        if (!probed) return;
        job.durationSec = probed;
        const meta = (await readJobMeta(job.dir)) ?? {
          plan: planFromProbeCodecs(null, null, {
            maxHeight: transcodeMaxHeight(),
          }),
          durationSec: probed,
        };
        meta.durationSec = probed;
        await writeJobMeta(job.dir, meta);
      });
    }
    const onDisk = await listSegmentFiles(job.dir);
    const diskPrefix = contiguousSegmentCount(onDisk);
    await maybeRecoverStalledFfmpeg(job, diskPrefix);
    // Heal tip-only MEDIA-SEQUENCE jumps before deciding completeness / serving.
    await ensureTranscodeJobContiguous(job);
    let rawAfterHeal = raw;
    try {
      rawAfterHeal = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
    } catch {
      /* keep prior raw */
    }
    const onDiskAfter = await listSegmentFiles(job.dir);
    await rememberFmp4Init(job.dir);
    await restoreFmp4Init(job.dir);
    const packagedNow = await fragmentedOutputState(job.dir);
    if (
      shouldRestartFragmentedTranscode({
        playlistText: rawAfterHeal,
        ...packagedNow,
        ffmpegRunning: !!(job.proc && job.proc.exitCode == null),
      })
    ) {
      await discardUnplayableTranscodeOutput(job);
      void beginTranscodeJob(job);
      return {
        status: 503,
        errorText: "First video segment is still being prepared. Retry in a few seconds.",
        extraHeaders: await vodSourceProgressHeaders(opts.upstream),
      };
    }
    // Completeness is disk + duration + source — not fragile in-memory job.state.
    // A finished from-0 encode after deploy hydrate must still serve VOD+ENDLIST
    // so hls.js does not treat the full movie as a live EVENT tip.
    const playlistComplete =
      job.proc == null &&
      (await isPlaylistFullyEncoded(job, rawAfterHeal));
    if (playlistComplete && job.state !== "ready") {
      job.state = "ready";
    }
    const trimmed = manifestTextForPlayback(
      rawAfterHeal,
      playlistComplete,
      onDiskAfter
    );
    if (!playlistComplete && countManifestSegments(trimmed) < 1) {
      return {
        status: 503,
        errorText: "First video segment is still being prepared. Retry in a few seconds.",
        extraHeaders: await vodSourceProgressHeaders(opts.upstream),
      };
    }
    const trimmedEncodedSec = sumExtinfDurationSec(trimmed);
    const manifestCompatMse = opts.forCast ? false : opts.compatMse;
    const rewritten = rewriteTranscodeManifest(
      trimmed,
      opts.upstream,
      manifestCompatMse,
      {
        durationSec,
        playlistComplete,
        startOffsetSec: job.startOffsetSec,
        encodedDurationSec: trimmedEncodedSec,
        forCast: opts.forCast,
        proxyOrigin: opts.proxyOrigin,
        chapterMarkers: jobMeta?.chapterMarkers,
      }
    );
    const durationHeader: Record<string, string> = {
      ...(await vodSourceProgressHeaders(opts.upstream)),
    };
    if (durationSec && durationSec > 0) {
      durationHeader["x-vod-duration-sec"] = String(durationSec);
    }
    // Always publish offset (including 0) so clients drop a stale tc_seek window
    // when we reuse a complete from-0 encode.
    durationHeader["x-vod-start-offset-sec"] = String(
      Math.max(0, Math.floor(job.startOffsetSec))
    );
    if (trimmedEncodedSec > 0) {
      durationHeader["x-vod-encoded-sec"] = String(
        trimmedEncodedSec.toFixed(3)
      );
    }
    if (jobMeta?.chapterMarkers) {
      Object.assign(
        durationHeader,
        chapterMarkerResponseHeaders(jobMeta.chapterMarkers)
      );
    }
    const extraDurationHeaders =
      Object.keys(durationHeader).length > 0 ? durationHeader : undefined;
    const manifestHeaders: Record<string, string> = {
      "cache-control": "no-cache, no-store",
      ...(extraDurationHeaders ?? {}),
    };
    if (opts.head) {
      return {
        status: 200,
        contentType: "application/vnd.apple.mpegurl",
        extraHeaders: manifestHeaders,
      };
    }
    return {
      status: 200,
      body: rewritten,
      contentType: "application/vnd.apple.mpegurl",
      extraHeaders: {
        ...manifestHeaders,
        "content-length": String(Buffer.byteLength(rewritten, "utf8")),
      },
    };
  }

  if (media === "init.mp4") await restoreFmp4Init(job.dir);
  const segPath = path.join(job.dir, media);
  let segmentReady = await waitForSegmentFile(segPath, 200);
  if (!segmentReady) {
    void ensureEncodingContinues(job);
    const ready = await waitForReady(job, opts.signal);
    if (!ready) {
      return {
        status: 503,
        errorText: job.error || "Segment not ready yet.",
        extraHeaders: { "retry-after": "2" },
      };
    }
    /** Encode can lag on a busy VPS — wait longer than one HLS segment. */
    segmentReady = await waitForSegmentFile(segPath, 28_000);
    if (!segmentReady) {
      await ensureTranscodeJobContiguous(job);
      void ensureEncodingContinues(job);
      return {
        status: 503,
        errorText: job.error || "Segment not ready yet.",
        extraHeaders: { "retry-after": "2" },
      };
    }
  }

  if (opts.head) {
    const st = await fsp.stat(segPath);
    return {
      status: 200,
      contentType: transcodeMediaContentType(media),
      extraHeaders: {
        "content-length": String(st.size),
        "cache-control": SEGMENT_CACHE_CONTROL,
      },
    };
  }

  if (media.endsWith(".m4s")) {
    await alignFmp4SegmentForPlayback(job.dir, media);
  }
  const data = await fsp.readFile(segPath);
  return {
    status: 200,
    body: new Uint8Array(data),
    contentType: transcodeMediaContentType(media),
    extraHeaders: {
      "content-length": String(data.byteLength),
      "cache-control": SEGMENT_CACHE_CONTROL,
    },
  };
}
