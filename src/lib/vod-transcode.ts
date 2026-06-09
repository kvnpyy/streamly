import "server-only";

import {
  contiguousSegmentCount,
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
import { spawn, type ChildProcess } from "child_process";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { validateVodUpstreamReadable } from "@/lib/vod-transcode-upstream";

const IPTV_UA_VOD = "VLC/3.0.20 LibVLC/3.0.20";
const MANIFEST_NAME = "index.m3u8";

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
    "5M",
    "-analyzeduration",
    "1.5M",
    "-user_agent",
    IPTV_UA_VOD,
  ];
  if (referer) args.push("-headers", `Referer: ${referer}\r\n`);
  return args;
}

function ffprobeInputArgs(referer: string): string[] {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-probesize",
    "12M",
    "-analyzeduration",
    "3M",
    "-user_agent",
    IPTV_UA_VOD,
  ];
  if (referer) args.push("-headers", `Referer: ${referer}\r\n`);
  return args;
}

/** Quick remote probe — picks copy vs transcode (usually &lt;5s vs minutes of encode). */
async function probeStreamCodec(
  upstream: string,
  stream: "v" | "a"
): Promise<string | null> {
  const referer = upstreamReferer(upstream);
  const select = stream === "v" ? "v:0" : "a:0";
  const args = [
    ...ffprobeInputArgs(referer),
    "-select_streams",
    select,
    "-show_entries",
    "stream=codec_name",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    upstream,
  ];

  return new Promise((resolve) => {
    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, 14_000);
    proc.stdout?.on("data", (c: Buffer) => {
      out += c.toString();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      const codec = out.trim().split(/\s+/)[0] || null;
      resolve(codec);
    });
  });
}

type JobMeta = {
  plan: VodTranscodePlan;
  durationSec: number | null;
  startOffsetSec?: number;
};

async function probeDurationSec(upstream: string): Promise<number | null> {
  const referer = upstreamReferer(upstream);
  const args = [
    ...ffprobeInputArgs(referer),
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    upstream,
  ];
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
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

async function resolveJobMeta(job: TranscodeJob): Promise<JobMeta> {
  const cached = await readJobMeta(job.dir);
  if (cached?.durationSec && cached.durationSec > 0) return cached;
  if (cached && cached.durationSec == null) {
    const durationSec = await probeDurationSec(job.upstream);
    if (durationSec) {
      cached.durationSec = durationSec;
      job.durationSec = durationSec;
      await writeJobMeta(job.dir, cached);
    }
    return cached;
  }

  const [videoCodec, audioCodec] = await Promise.all([
    probeStreamCodec(job.upstream, "v"),
    probeStreamCodec(job.upstream, "a"),
  ]);
  const plan = planFromProbeCodecs(videoCodec, audioCodec, {
    maxHeight: transcodeMaxHeight(),
  });
  const meta: JobMeta = {
    plan,
    durationSec: null,
    startOffsetSec: job.startOffsetSec,
  };
  await writeJobMeta(job.dir, meta);

  void probeDurationSec(job.upstream).then(async (durationSec) => {
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
};

const jobs = new Map<string, TranscodeJob>();
/** One in-flight ensureJob per cache key — prevents duplicate ffmpeg on the same output dir. */
const ensureJobInflight = new Map<string, Promise<TranscodeJob>>();

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
const CACHE_KEY_SUFFIX = "|v7-smooth";

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
    return new Set(files.filter((f) => SEGMENT_RE.test(f)));
  } catch {
    return new Set();
  }
}

async function isPlaylistFullyEncoded(
  job: TranscodeJob,
  raw: string
): Promise<boolean> {
  if (!raw.includes("#EXT-X-ENDLIST")) return false;
  const encoded = sumExtinfDurationSec(raw);
  if (job.durationSec != null && job.durationSec > 0) {
    return encoded >= job.durationSec * 0.92;
  }
  return true;
}

/**
 * Duplicate ffmpeg resumes can leave seg_00027 missing while seg_00054 exists.
 * Playback only sees the contiguous prefix (often ~2 min) then freezes forever.
 */
async function healTranscodeJobContiguity(job: TranscodeJob): Promise<number> {
  if (job.proc && job.proc.exitCode == null) {
    return contiguousSegmentCount(await listSegmentFiles(job.dir));
  }

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
    const raw = await fsp.readFile(path.join(dir, MANIFEST_NAME), "utf8");
    const healed = prepareManifestForPlayback(raw, false, healedDisk);
    await fsp.writeFile(path.join(dir, MANIFEST_NAME), healed, "utf8");
  } catch {
    /* manifest will be rebuilt on next encode */
  }

  return prefixCount;
}

const resumeInflight = new Map<string, Promise<void>>();

async function resumeTranscodeJob(job: TranscodeJob): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    job.state = "queued";
    return;
  }
  try {
    const prefixCount = await healTranscodeJobContiguity(job);
    if (prefixCount === 0) {
      void beginTranscodeJob(job);
      return;
    }
    const meta = await resolveJobMeta(job);
    job.durationSec = meta.durationSec ?? job.durationSec;
    const raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
    const onDisk = await listSegmentFiles(job.dir);
    const trimmed = prepareManifestForPlayback(raw, false, onDisk);
    const encoded = sumExtinfDurationSec(trimmed);
    await spawnFfmpeg(job, meta.plan, {
      seekInSourceSec: job.startOffsetSec + encoded,
      startSegmentNumber: prefixCount,
    });
  } catch (err) {
    job.state = "failed";
    job.error =
      err instanceof Error ? err.message : "Could not resume transcode.";
    notifyWaiters(job, false);
  }
}

/** Keep ffmpeg running (or restart after crash/reboot) until the full episode is encoded. */
async function ensureEncodingContinues(job: TranscodeJob): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;

  let raw: string | null = null;
  try {
    raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
  } catch {
    if (job.state !== "failed") void beginTranscodeJob(job);
    return;
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
    await new Promise((r) => setTimeout(r, 200));
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
  resume?: { seekInSourceSec: number; startSegmentNumber: number }
): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;
  if (activeTranscodeCount() >= maxConcurrentJobs()) {
    job.state = "queued";
    return;
  }
  await fsp.mkdir(job.dir, { recursive: true });
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
    ...ffmpegInputArgs(refererHost),
    ...(seekSec > 0 ? ["-ss", String(seekSec)] : []),
    "-i",
    upstreamUrl,
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
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
      "veryfast",
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
      void ensureEncodingContinues(job);
      drainTranscodeQueue();
    })();
  });
}

async function wipeTranscodeJobDir(dir: string, key: string): Promise<void> {
  const job = jobs.get(key);
  if (job?.proc) {
    try {
      job.proc.kill("SIGTERM");
    } catch {
      /* noop */
    }
    job.proc = null;
  }
  jobs.delete(key);
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

/** Free ffmpeg slots and provider bandwidth when the user jumps to a new offset. */
async function cancelSiblingTranscodeJobs(
  upstream: string,
  keepKey: string
): Promise<void> {
  const victims: Array<{ key: string; dir: string }> = [];
  for (const [key, job] of jobs.entries()) {
    if (key === keepKey || job.upstream !== upstream) continue;
    victims.push({ key, dir: job.dir });
  }
  await Promise.all(
    victims.map(({ key, dir }) => wipeTranscodeJobDir(dir, key))
  );
}

/** One-connection IPTV accounts: only one upstream pull can succeed at a time. */
async function cancelOtherUpstreamTranscodeJobs(
  upstream: string,
  keepKey: string
): Promise<void> {
  const victims: Array<{ key: string; dir: string }> = [];
  for (const [key, job] of jobs.entries()) {
    if (key === keepKey || job.upstream === upstream) continue;
    victims.push({ key, dir: job.dir });
  }
  await Promise.all(
    victims.map(({ key, dir }) => wipeTranscodeJobDir(dir, key))
  );
}

async function ensureJobLocked(
  upstream: string,
  opts?: { resetCache?: boolean; seekSec?: number }
): Promise<TranscodeJob> {
  const startOffsetSec = Math.max(0, Math.floor(opts?.seekSec ?? 0));
  const key = cacheKeyForUpstream(upstream, startOffsetSec);
  const dir = jobDir(key);

  if (startOffsetSec > 0) {
    await cancelSiblingTranscodeJobs(upstream, key);
  } else {
    await cancelOtherUpstreamTranscodeJobs(upstream, key);
  }

  if (opts?.resetCache) {
    const pending = ensureJobInflight.get(key);
    if (pending) await pending.catch(() => {});
    await wipeTranscodeJobDir(dir, key);
  }

  const existing = jobs.get(key);
  if (existing) {
    if (existing.startOffsetSec !== startOffsetSec) {
      await wipeTranscodeJobDir(dir, key);
    } else if (existing.state === "failed") {
      const again = await readManifestIfReady(dir);
      if (again) {
        existing.state = "ready";
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
  const startOffsetSec = Math.max(0, Math.floor(opts?.seekSec ?? 0));
  const key = cacheKeyForUpstream(upstream, startOffsetSec);
  const inflight = ensureJobInflight.get(key);
  if (inflight) return inflight;

  const promise = ensureJobLocked(upstream, opts);
  ensureJobInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (ensureJobInflight.get(key) === promise) {
      ensureJobInflight.delete(key);
    }
  }
}

async function beginTranscodeJob(job: TranscodeJob): Promise<void> {
  if (job.proc && job.proc.exitCode == null) return;

  const partial = await readManifestIfReady(job.dir);
  if (partial) {
    if (await isPlaylistFullyEncoded(job, partial)) return;
    await ensureEncodingContinues(job);
    return;
  }

  if (job.state === "running" || job.state === "ready") {
    if (await readManifestIfReady(job.dir)) return;
  }
  try {
    const meta = await resolveJobMeta(job);
    job.durationSec = meta.durationSec;
    const plan = meta.plan;
    if (job.state === "failed") return;

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

    const upstreamErr = await validateVodUpstreamReadable(job.upstream);
    if (upstreamErr) {
      job.state = "failed";
      job.error = upstreamErr;
      notifyWaiters(job, false);
      drainTranscodeQueue();
      return;
    }

    job.state = "starting";
    await spawnFfmpeg(job, plan);
  } catch (err) {
    job.state = "failed";
    job.error =
      err instanceof Error ? err.message : "Could not probe or start transcode.";
    notifyWaiters(job, false);
    drainTranscodeQueue();
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

  const job = await ensureJob(opts.upstream, {
    resetCache: opts.resetCache,
    seekSec: opts.seekSec,
  });
  const media =
    opts.media && opts.media !== MANIFEST_NAME
      ? path.basename(opts.media)
      : MANIFEST_NAME;

  if (!SEGMENT_RE.test(media) && media !== MANIFEST_NAME) {
    return { status: 400, errorText: "Invalid transcode media." };
  }

  if (media === MANIFEST_NAME) {
    await healTranscodeJobContiguity(job);
    void ensureEncodingContinues(job);
    const manifestWait = transcodeManifestWaitMs(opts.seekSec ?? 0, {
      httpWaitMs: manifestHttpWaitMs(),
      playlistWaitMs: waitForPlaylistMs(),
    });
    const ready = await waitForReady(job, opts.signal, manifestWait, {
      failJobOnTimeout: false,
    });
    if (!ready) {
      const stillStarting =
        job.state === "starting" ||
        job.state === "running" ||
        job.state === "queued";
      const busy =
        job.state === "queued" ||
        job.error?.includes("busy") ||
        job.error?.includes("Too many");
      if (stillStarting && !busy) {
        return {
          status: 503,
          errorText:
            "First video segment is still being prepared. Retry in a few seconds.",
          extraHeaders: { "retry-after": "2" },
        };
      }
      return {
        status: busy ? 503 : 502,
        errorText: job.error || "Could not prepare transcoded stream.",
        extraHeaders: busy ? { "retry-after": "3" } : undefined,
      };
    }
    const raw = await fsp.readFile(path.join(job.dir, MANIFEST_NAME), "utf8");
    const durationSec =
      job.durationSec ?? (await readJobMeta(job.dir))?.durationSec ?? null;
    if (!durationSec || durationSec <= 0) {
      void probeDurationSec(opts.upstream).then(async (probed) => {
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
    const encodedDurationSec = sumExtinfDurationSec(raw);
    const playlistComplete =
      job.state === "ready" &&
      job.proc == null &&
      raw.includes("#EXT-X-ENDLIST") &&
      (job.durationSec == null ||
        job.durationSec <= 0 ||
        encodedDurationSec >= job.durationSec * 0.92);
    const onDisk = await listSegmentFiles(job.dir);
    const trimmed = prepareManifestForPlayback(
      raw,
      playlistComplete,
      onDisk
    );
    if (
      !playlistComplete &&
      !trimmed.split(/\r?\n/).some((l) => SEGMENT_RE.test(l.trim()))
    ) {
      return {
        status: 503,
        errorText: "First video segment is still being prepared. Retry in a few seconds.",
      };
    }
    const trimmedEncodedSec = sumExtinfDurationSec(trimmed);
    const rewritten = rewriteTranscodeManifest(
      trimmed,
      opts.upstream,
      opts.compatMse,
      {
        durationSec,
        playlistComplete,
        startOffsetSec: job.startOffsetSec,
        encodedDurationSec: trimmedEncodedSec,
        forCast: opts.forCast,
        proxyOrigin: opts.proxyOrigin,
      }
    );
    const durationHeader: Record<string, string> = {};
    if (durationSec && durationSec > 0) {
      durationHeader["x-vod-duration-sec"] = String(durationSec);
    }
    if (job.startOffsetSec > 0) {
      durationHeader["x-vod-start-offset-sec"] = String(job.startOffsetSec);
    }
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
      return {
        status: 404,
        errorText: "Segment not ready yet.",
      };
    }
    segmentReady = await waitForSegmentFile(segPath, 14_000);
    if (!segmentReady) {
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
