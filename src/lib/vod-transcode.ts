import "server-only";

import {
  buildManifestFromContiguousDisk,
  contiguousSegmentCount,
  encodedCoverageSec,
  manifestIsTipOnlyTail,
  manifestNeedsContiguityHeal,
  resumeSeekSecForDiskPrefix,
  countManifestSegments,
  hasOrphanSegmentsBeyondPrefix,
  manifestReferencesMissingOrGappedSegments,
  parseExtinfDurationsBySegment,
  prepareManifestForPlayback,
  rewriteTranscodeManifest,
  sumExtinfDurationSec,
  VOD_TRANSCODE_SEGMENT_RE as SEGMENT_RE,
} from "@/lib/vod-transcode-manifest";
import { transcodeManifestWaitMs } from "@/lib/vod-transcode-wait";
import {
  planFromProbeCodecs,
  type VodTranscodePlan,
} from "@/lib/vod-transcode-plan";
import {
  pickBestAudioStreamIndex,
  type ProbedAudioStream,
} from "@/lib/vod-transcode-audio";
import { spawn, type ChildProcess } from "child_process";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { validateVodUpstreamReadable } from "@/lib/vod-transcode-upstream";
import {
  ensureVodSource,
  getVodSourceStatus,
  isVodSourceCacheEnabled,
  isVodSourceComplete,
  releaseVodSourceDownload,
  reopenVodSourceIfTruncated,
  touchVodSource,
  vodSourceStartBytes,
  waitForVodSourceBytes,
  waitForVodSourceForSeek,
  waitForVodSourceGrowth,
} from "@/lib/vod-source-cache";
import {
  quantizeTranscodeSeekSec,
  shouldReuseTranscodeJobForSeek,
} from "@/lib/vod-transcode-seek-policy";

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
  const n = parseFloat(process.env.STREAM_TRANSCODE_HLS_TIME ?? "2");
  return Number.isFinite(n) && n >= 2 && n <= 8 ? n : 2;
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
  // Always rebuild from contiguous disk segments. ffmpeg's on-disk m3u8 is not
  // the playback contract — resume without append_list rewrites MEDIA-SEQUENCE
  // to the tip and clients then cannot scrub backward into earlier segments.
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
    fast ? "1M" : "8M",
    "-analyzeduration",
    fast ? "750K" : "2M",
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
};

/** One ffprobe round-trip — picks the best audio stream index for ffmpeg `-map`. */
async function probeStreamCodecs(input: string): Promise<ProbedCodecs> {
  const local = !isHttpInput(input);
  const referer = local ? "" : upstreamReferer(input);
  const args = [
    ...ffprobeInputArgs(referer, true, local),
    "-select_streams",
    "v:0,a",
    "-show_entries",
    "stream=index,codec_name,codec_type,channels",
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
          }>;
        };
        let video: string | null = null;
        const audioStreams: ProbedAudioStream[] = [];
        for (const stream of parsed.streams ?? []) {
          const type = stream.codec_type?.toLowerCase();
          const name = stream.codec_name?.trim() || null;
          const index =
            typeof stream.index === "number" && Number.isFinite(stream.index)
              ? stream.index
              : null;
          if (type === "video" && !video && name) video = name;
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
        });
      } catch {
        resolve(empty);
      }
    });
  });
}

type JobMeta = {
  plan: VodTranscodePlan;
  durationSec: number | null;
  startOffsetSec?: number;
  audioStreamIndex?: number | null;
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
  if (isVodSourceCacheEnabled()) {
    const st = await getVodSourceStatus(job.upstream);
    if (st && st.bytes >= Math.min(1_000_000, vodSourceStartBytes())) {
      return st.path;
    }
  }
  return job.upstream;
}

async function resolveJobMeta(job: TranscodeJob): Promise<JobMeta> {
  const cached = await readJobMeta(job.dir);
  let probeInput = await resolveProbeInput(job);

  // Early HTTP probes of a tiny .partial often report "no audio". Wait for a
  // bit more local source before locking audioStreamIndex: null into meta.
  if (
    isVodSourceCacheEnabled() &&
    (cached?.audioStreamIndex == null || !cached) &&
    isHttpInput(probeInput)
  ) {
    try {
      await waitForVodSourceBytes(
        job.upstream,
        Math.max(vodSourceStartBytes(), 2_000_000),
        { timeoutMs: 45_000 }
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
    return cached;
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
    return cached;
  }

  const { video: videoCodec, audio: audioCodec, audioStreamIndex, audioStreamCount } =
    await probeStreamCodecs(probeInput);
  const plan = planFromProbeCodecs(videoCodec, audioCodec, {
    maxHeight: transcodeMaxHeight(),
  });
  if (audioStreamCount === 0) {
    console.warn(
      `[vod-transcode] no audio streams in upstream (key=${job.key})`
    );
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
};

const jobs = new Map<string, TranscodeJob>();
let idleSweepTimer: ReturnType<typeof setInterval> | null = null;

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
  if (job) job.lastViewerAt = Date.now();
  // Tip seeks often reuse the from-0 job — keep that viewer warm too.
  if (startOffsetSec > 0) {
    const base = jobs.get(cacheKeyForUpstream(upstream, 0));
    if (base) base.lastViewerAt = Date.now();
  }
  ensureIdleSweepRunning();
}

function noteTranscodeViewer(job: TranscodeJob): void {
  job.lastViewerAt = Date.now();
  touchVodSource(job.upstream);
  ensureIdleSweepRunning();
}

function ensureIdleSweepRunning(): void {
  if (idleSweepTimer) return;
  idleSweepTimer = setInterval(() => {
    void sweepIdleTranscodeJobs();
  }, transcodeIdleSweepMs());
  idleSweepTimer.unref?.();
}

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
    if (jobViewerActive(job)) continue;
    if (!job.proc || job.proc.exitCode != null) continue;
    try {
      const raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
      if (await isPlaylistFullyEncoded(job, raw)) continue;
    } catch {
      /* no manifest yet — still safe to stop a runaway encode */
    }
    stopTranscodeProcOnly(job);
  }
}

/** Client closed player — stop all ffmpeg for this upstream immediately. */
export function releaseVodTranscodeJobs(upstream: string): number {
  let stopped = 0;
  for (const job of jobs.values()) {
    if (job.upstream !== upstream) continue;
    job.lastViewerAt = 0;
    if (stopTranscodeProcOnly(job)) stopped += 1;
  }
  // Keep the source download while any writer for this upstream is still exiting.
  const stillWriting = [...jobs.values()].some(
    (j) =>
      j.upstream === upstream &&
      ((j.proc && j.proc.exitCode == null) || spawnFfmpegInflight.has(j.key))
  );
  if (!stillWriting) {
    releaseVodSourceDownload(upstream);
  }
  return stopped;
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
  if (activeTranscodeCount() >= maxConcurrentJobs()) return;
  for (const job of jobs.values()) {
    if (job.state !== "queued") continue;
    job.state = "starting";
    void beginTranscodeJob(job);
    return;
  }
}

/** Bump suffix when transcode output format changes (invalidates stale cache). */
const CACHE_KEY_SUFFIX = "|v8-src";

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
  if (job.durationSec != null && job.durationSec > 0) {
    if (encoded < job.durationSec * 0.92) return false;
  } else if (encoded < 90) {
    // Unknown duration + short ENDLIST is almost always an early upstream EOF.
    return false;
  }
  if (isVodSourceCacheEnabled() && !(await isVodSourceComplete(job.upstream))) {
    return false;
  }
  return true;
}

/**
 * Duplicate ffmpeg resumes can leave seg_00027 missing while seg_00054 exists.
 * Playback only sees the contiguous prefix (often ~2 min) then freezes forever.
 */
function waitForProcExit(
  proc: ChildProcess,
  maxWaitMs = 8000
): Promise<void> {
  if (proc.exitCode != null) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    proc.once("close", done);
    proc.once("error", done);
    const timer = setTimeout(done, maxWaitMs);
    timer.unref?.();
  });
}

/** Drop orphan seg_00058+ files and rewrite index.m3u8 to a contiguous prefix. */
async function healTranscodeJobContiguity(job: TranscodeJob): Promise<number> {
  const dir = job.dir;
  const onDisk = await listSegmentFiles(dir);
  const prefixCount = contiguousSegmentCount(onDisk);
  if (prefixCount === 0) return 0;

  const lastSeq = prefixCount - 1;
  for (const name of onDisk) {
    const m = /^seg_(\d+)\.ts$/.exec(name);
    if (!m) continue;
    if (parseInt(m[1]!, 10) > lastSeq) {
      await fsp.rm(path.join(dir, name), { force: true }).catch(() => {});
    }
  }

  const healedDisk = new Set(
    [...onDisk].filter((f) => {
      const m = /^seg_(\d+)\.ts$/.exec(f);
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
    const playlistComplete =
      durationSec != null &&
      durationSec > 0 &&
      diskEncoded >= durationSec * 0.92;
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

  // Tip-only tails while ffmpeg is still writing: do NOT kill the encoder or
  // rewrite its live m3u8 — serve-time synthesis rebuilds from disk. Heal the
  // on-disk playlist only once the process has exited.
  if (tipOnlyTail && job.proc && job.proc.exitCode == null) {
    return prefix;
  }

  if (job.proc && job.proc.exitCode == null) {
    const proc = job.proc;
    try {
      proc.kill("SIGTERM");
    } catch {
      /* noop */
    }
    await waitForProcExit(proc);
    job.proc = null;
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
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    job.state = "queued";
    return;
  }
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
    const prefixCount = await ensureTranscodeJobContiguous(job);
    if (prefixCount === 0) {
      void beginTranscodeJob(job);
      return;
    }
    // Force a contiguous MEDIA-SEQUENCE:0 playlist before append_list resume.
    await healTranscodeJobContiguity(job);
    const meta = await resolveJobMeta(job);
    job.durationSec = meta.durationSec ?? job.durationSec;
    const raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
    const onDisk = await listSegmentFiles(job.dir);
    const trimmed = prepareManifestForPlayback(raw, false, onDisk);
    const seekInSourceSec = resumeSeekSecForDiskPrefix({
      startOffsetSec: job.startOffsetSec,
      prefixCount: contiguousSegmentCount(onDisk),
      segmentSec: hlsSegmentSeconds(),
      manifestEncodedSec: sumExtinfDurationSec(trimmed),
    });
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
    const prefixNow = contiguousSegmentCount(await listSegmentFiles(job.dir));
    await spawnFfmpeg(job, meta.plan, {
      seekInSourceSec,
      startSegmentNumber: prefixNow,
    }, meta.audioStreamIndex);
  } catch (err) {
    job.state = "failed";
    job.error =
      err instanceof Error ? err.message : "Could not resume transcode.";
    notifyWaiters(job, false);
  }
}

/** Keep ffmpeg running while a viewer is active until the full episode is encoded. */
async function ensureEncodingContinues(job: TranscodeJob): Promise<void> {
  if (!jobViewerActive(job)) return;
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

async function waitForReady(
  job: TranscodeJob,
  signal?: AbortSignal,
  maxWaitMs?: number,
  opts?: { failJobOnTimeout?: boolean }
): Promise<boolean> {
  const existing = await readManifestIfReady(job.dir);
  if (existing) {
    job.state = "ready";
    return true;
  }

  const deadline = Date.now() + (maxWaitMs ?? waitForPlaylistMs());
  while (Date.now() < deadline) {
    const state = job.state;
    if (state === "ready") return true;
    if (state === "failed") {
      notifyWaiters(job, false);
      return false;
    }
    if (state === "queued") drainTranscodeQueue();
    if (signal?.aborted) return !!(await readManifestIfReady(job.dir));
    const text = await readManifestIfReady(job.dir);
    if (text) {
      job.state = "ready";
      notifyWaiters(job, true);
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const late = await readManifestIfReady(job.dir);
  if (late) {
    job.state = "ready";
    notifyWaiters(job, true);
    return true;
  }
  if (opts?.failJobOnTimeout !== false) {
    job.state = "failed";
    job.error = "Transcode took too long to start.";
    notifyWaiters(job, false);
  }
  return false;
}

async function spawnFfmpeg(
  job: TranscodeJob,
  plan: VodTranscodePlan,
  resume?: { seekInSourceSec: number; startSegmentNumber: number },
  audioStreamIndex?: number | null
): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;
  if (spawnFfmpegInflight.has(job.key)) return;
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    job.state = "queued";
    return;
  }
  spawnFfmpegInflight.add(job.key);
  try {
    await spawnFfmpegLocked(job, plan, resume, audioStreamIndex);
  } finally {
    spawnFfmpegInflight.delete(job.key);
  }
}

async function spawnFfmpegLocked(
  job: TranscodeJob,
  plan: VodTranscodePlan,
  resume?: { seekInSourceSec: number; startSegmentNumber: number },
  audioStreamIndex?: number | null
): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;
  // Kill orphan writers left after a prior SIGTERM-without-wait.
  await stopJobProc(job);
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    job.state = "queued";
    return;
  }
  await fsp.mkdir(job.dir, { recursive: true });
  // Re-check after await — another caller may have started ffmpeg.
  if (job.proc && job.proc.exitCode == null) return;
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    job.state = "queued";
    return;
  }

  let inputPath = job.upstream;
  let useLocalSource = false;
  if (isVodSourceCacheEnabled()) {
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
  const gop = Math.max(24, Math.round(segSec * 24));
  const seekSec = resume
    ? Math.max(0, resume.seekInSourceSec)
    : Math.max(0, Math.floor(job.startOffsetSec));

  const segPattern = path.join(job.dir, "seg_%05d.ts");
  const outManifest = path.join(job.dir, MANIFEST_NAME);
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    ...(useLocalSource ? [] : ffmpegInputArgs(refererHost)),
    ...(seekSec > 0 ? ["-ss", String(seekSec)] : []),
    "-i",
    inputPath,
    "-map",
    "0:v:0?",
    "-map",
    audioStreamIndex != null ? `0:${audioStreamIndex}?` : "0:a:0?",
  ];

  if (plan.mode === "copy") {
    args.push(
      "-c",
      "copy",
      "-bsf:v",
      "h264_mp4toannexb"
    );
  } else if (plan.mode === "copyVideo") {
    args.push(
      "-c:v",
      "copy",
      "-bsf:v",
      "h264_mp4toannexb",
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
      "-c:v",
      "libx264",
      "-preset",
      x264Preset(),
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      "-fps_mode",
      "cfr",
      "-g",
      String(gop),
      "-keyint_min",
      String(gop),
      "-sc_threshold",
      "0",
      "-force_key_frames",
      `expr:gte(t,n_forced*${segSec})`,
      "-vf",
      `scale='min(${plan.maxHeight},iw)':-2`,
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
    "-f",
    "hls",
    "-hls_time",
    String(segSec),
    "-hls_list_size",
    "0",
    // Always append_list. Before resume we rewrite a contiguous MEDIA-SEQUENCE:0
    // playlist from disk — without that heal, append_list can jump MEDIA-SEQUENCE
    // while keeping early URIs; without append_list, ffmpeg replaces the file
    // with a tip-only playlist and scrub-back dies.
    "-hls_flags",
    "independent_segments+temp_file+append_list",
    "-hls_segment_type",
    "mpegts",
    "-hls_segment_filename",
    segPattern,
  );
  if (resume && resume.startSegmentNumber > 0) {
    args.push("-start_number", String(resume.startSegmentNumber));
  }
  args.push(outManifest);

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
      if (jobViewerActive(job)) {
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
      }
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
  opts?: { resetCache?: boolean; seekSec?: number }
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
  } else {
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
        // Drop premature ENDLIST so encoding can continue.
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
  await fsp.mkdir(dir, { recursive: true });

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
    lastViewerAt: Date.now(),
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
  opts?: { resetCache?: boolean; seekSec?: number }
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

    if (isVodSourceCacheEnabled()) {
      try {
        await waitForVodSourceBytes(job.upstream, vodSourceStartBytes(), {
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

    const meta = await resolveJobMeta(job);

    if (isVodSourceCacheEnabled() && job.startOffsetSec > 0) {
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
    while (
      activeTranscodeCount() >= maxConcurrentJobs() &&
      waited < slotWaitMs
    ) {
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
    await spawnFfmpeg(job, plan, undefined, meta.audioStreamIndex);
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
    touchVodSource(opts.upstream);
    if (isVodSourceCacheEnabled()) ensureVodSource(opts.upstream);
  }

  const job = await ensureJob(opts.upstream, {
    resetCache: opts.resetCache,
    seekSec: opts.seekSec,
  });
  if (!opts.head) {
    noteTranscodeViewer(job);
  }
  const media =
    opts.media && opts.media !== MANIFEST_NAME
      ? path.basename(opts.media)
      : MANIFEST_NAME;

  if (!SEGMENT_RE.test(media) && media !== MANIFEST_NAME) {
    return { status: 400, errorText: "Invalid transcode media." };
  }

  if (media === MANIFEST_NAME) {
    void ensureTranscodeJobContiguous(job);
    void ensureEncodingContinues(job);
    /** Warm requests (HEAD) must not block — kick ffmpeg and return immediately. */
    if (opts.head) {
      if (isVodSourceCacheEnabled()) ensureVodSource(opts.upstream);
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
    const durationSec =
      job.durationSec ?? (await readJobMeta(job.dir))?.durationSec ?? null;
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
    const coverageSec = encodedCoverageSec({
      manifestText: rawAfterHeal,
      onDisk: onDiskAfter,
      segmentSec: hlsSegmentSeconds(),
    });
    const sourceComplete =
      !isVodSourceCacheEnabled() ||
      (await isVodSourceComplete(opts.upstream));
    const durationKnown = job.durationSec != null && job.durationSec > 0;
    const playlistComplete =
      job.state === "ready" &&
      job.proc == null &&
      sourceComplete &&
      !manifestIsTipOnlyTail(rawAfterHeal, onDiskAfter) &&
      (durationKnown
        ? coverageSec >= job.durationSec! * 0.92
        : coverageSec >= 90);
    const trimmed = manifestTextForPlayback(
      rawAfterHeal,
      playlistComplete,
      onDiskAfter
    );
    if (
      !playlistComplete &&
      !trimmed.split(/\r?\n/).some((l) => SEGMENT_RE.test(l.trim()))
    ) {
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

  const segPath = path.join(job.dir, media);
  let segmentReady = await waitForSegmentFile(segPath, 200);
  if (!segmentReady) {
    void ensureEncodingContinues(job);
    const ready = await waitForReady(job, opts.signal);
    if (!ready) {
      const stillEncoding =
        job.state === "starting" ||
        job.state === "running" ||
        job.state === "queued";
      return {
        status: stillEncoding ? 503 : 404,
        errorText: "Segment not ready yet.",
        extraHeaders: stillEncoding ? { "retry-after": "2" } : undefined,
      };
    }
    /** Encode can lag on a busy VPS — wait longer than one HLS segment. */
    segmentReady = await waitForSegmentFile(segPath, 28_000);
    if (!segmentReady) {
      const diskAfterWait = await listSegmentFiles(job.dir);
      const diskPrefix = contiguousSegmentCount(diskAfterWait);
      const seqMatch = /^seg_(\d+)\.ts$/.exec(media);
      const segNum = seqMatch ? parseInt(seqMatch[1]!, 10) : -1;
      const notEncodedYet =
        segNum >= 0 &&
        (segNum >= diskPrefix || !diskAfterWait.has(media));
      if (notEncodedYet) {
        await ensureTranscodeJobContiguous(job);
        void ensureEncodingContinues(job);
        return {
          status: 503,
          errorText: "Segment not ready yet.",
          extraHeaders: { "retry-after": "2" },
        };
      }
      return { status: 404, errorText: "Segment not found." };
    }
  }

  if (opts.head) {
    const st = await fsp.stat(segPath);
    return {
      status: 200,
      contentType: "video/mp2t",
      extraHeaders: {
        "content-length": String(st.size),
        "cache-control": SEGMENT_CACHE_CONTROL,
      },
    };
  }

  const data = await fsp.readFile(segPath);
  return {
    status: 200,
    body: new Uint8Array(data),
    contentType: "video/mp2t",
    extraHeaders: {
      "content-length": String(data.byteLength),
      "cache-control": SEGMENT_CACHE_CONTROL,
    },
  };
}
