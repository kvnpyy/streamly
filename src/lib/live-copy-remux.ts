import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const IPTV_UA =
  "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 IPTVSmartersPlayer/3.1.5";

const SEGMENT_RE = /^seg_\d+\.ts$/;
const IDLE_MS = 45_000;
const PLAYLIST_WAIT_MS = 8_000;
/** First H.264 segment is slower than a copy. */
const BROWSER_PLAYLIST_WAIT_MS = 15_000;

export type LiveRemuxMode = "copy" | "browser";

export function isLiveCopyRemuxEnabled(): boolean {
  return process.env.STREAM_LIVE_REMUX !== "0";
}

function maxJobs(): number {
  const n = parseInt(process.env.STREAM_LIVE_REMUX_MAX_JOBS ?? "2", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 4) : 2;
}

function cacheRoot(): string {
  return (
    process.env.STREAM_LIVE_REMUX_DIR?.trim() ||
    path.join(process.cwd(), ".cache", "live-remux")
  );
}

export function liveRemuxJobHash(
  upstream: string,
  mode: LiveRemuxMode = "copy"
): string {
  return createHash("sha256")
    .update(`${mode}\n${upstream}`)
    .digest("hex")
    .slice(0, 24);
}

export function liveRemuxMediaBasename(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = path.basename(name);
  return SEGMENT_RE.test(base) ? base : null;
}

export function buildLiveCopyRemuxArgs(opts: {
  inputUrl: string;
  outputDir: string;
  userAgent?: string;
}): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-user_agent",
    opts.userAgent ?? IPTV_UA,
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "4",
    "-rw_timeout",
    "15000000",
    "-i",
    opts.inputUrl,
    "-c",
    "copy",
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_list_size",
    "6",
    "-hls_flags",
    "delete_segments+append_list+omit_endlist+independent_segments",
    "-hls_segment_filename",
    path.join(opts.outputDir, "seg_%05d.ts"),
    path.join(opts.outputDir, "index.m3u8"),
  ];
}

/**
 * One provider connection, re-encoded to H.264 Baseline + AAC-LC.
 * Phones and Safari can play this when the source is HEVC, MPEG-2, or Dolby/DTS.
 */
export function buildLiveBrowserTranscodeArgs(opts: {
  inputUrl: string;
  outputDir: string;
  userAgent?: string;
}): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-user_agent",
    opts.userAgent ?? IPTV_UA,
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "4",
    "-rw_timeout",
    "15000000",
    "-fflags",
    "+genpts+discardcorrupt",
    "-i",
    opts.inputUrl,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale=w='min(1280,iw)':h=-2",
    "-b:v",
    "1400k",
    "-maxrate",
    "1800k",
    "-bufsize",
    "2800k",
    "-g",
    "48",
    "-keyint_min",
    "48",
    "-sc_threshold",
    "0",
    "-threads",
    "2",
    "-c:a",
    "aac",
    "-profile:a",
    "aac_low",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-b:a",
    "128k",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "8",
    "-hls_flags",
    "delete_segments+append_list+omit_endlist+independent_segments",
    "-hls_segment_filename",
    path.join(opts.outputDir, "seg_%05d.ts"),
    path.join(opts.outputDir, "index.m3u8"),
  ];
}

/** Rewrite ffmpeg's relative segment names onto the same remux proxy URL. */
export function rewriteLiveRemuxPlaylist(
  playlist: string,
  segmentQueryPath: string
): string {
  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const base = liveRemuxMediaBasename(trimmed.split("?")[0] ?? trimmed);
      if (!base) return line;
      const join = segmentQueryPath.includes("?") ? "&" : "?";
      return `${segmentQueryPath}${join}media=${encodeURIComponent(base)}`;
    })
    .join("\n");
}

type Job = {
  hash: string;
  dir: string;
  proc: ChildProcess | null;
  lastAccessMs: number;
  ready: Promise<boolean>;
};

const jobs = new Map<string, Job>();
let resolvedFfmpeg: string | null | undefined;

function ffmpegCandidates(): string[] {
  const out: string[] = [];
  const configured = process.env.STREAM_FFMPEG_PATH?.trim();
  if (configured) out.push(configured);
  out.push("/usr/bin/ffmpeg", "ffmpeg");
  return [...new Set(out)];
}

function probeFfmpeg(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function resolveFfmpeg(): Promise<string | null> {
  if (resolvedFfmpeg !== undefined) return resolvedFfmpeg;
  for (const candidate of ffmpegCandidates()) {
    if (await probeFfmpeg(candidate)) {
      resolvedFfmpeg = candidate;
      return candidate;
    }
  }
  resolvedFfmpeg = null;
  return null;
}

async function waitForPlaylist(dir: string, timeoutMs: number): Promise<boolean> {
  const file = path.join(dir, "index.m3u8");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const text = await readFile(file, "utf8");
      if (text.includes("#EXTINF")) return true;
    } catch {
      /* not written yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function killJob(job: Job): void {
  try {
    job.proc?.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  job.proc = null;
  jobs.delete(job.hash);
  void rm(job.dir, { recursive: true, force: true }).catch(() => {});
}

function sweepIdle(now: number): void {
  for (const job of jobs.values()) {
    if (now - job.lastAccessMs >= IDLE_MS) killJob(job);
  }
}

async function ensureJob(
  upstream: string,
  mode: LiveRemuxMode
): Promise<Job | "busy" | "no-ffmpeg"> {
  sweepIdle(Date.now());
  const hash = liveRemuxJobHash(upstream, mode);
  const existing = jobs.get(hash);
  if (existing) {
    existing.lastAccessMs = Date.now();
    return existing;
  }
  if (jobs.size >= maxJobs()) return "busy";
  const ffmpeg = await resolveFfmpeg();
  if (!ffmpeg) return "no-ffmpeg";
  const dir = path.join(cacheRoot(), hash);
  await mkdir(dir, { recursive: true });
  const args =
    mode === "browser"
      ? buildLiveBrowserTranscodeArgs({ inputUrl: upstream, outputDir: dir })
      : buildLiveCopyRemuxArgs({ inputUrl: upstream, outputDir: dir });
  const proc = spawn(ffmpeg, args, { stdio: "ignore" });
  const job: Job = {
    hash,
    dir,
    proc,
    lastAccessMs: Date.now(),
    ready: waitForPlaylist(
      dir,
      mode === "browser" ? BROWSER_PLAYLIST_WAIT_MS : PLAYLIST_WAIT_MS
    ),
  };
  proc.on("error", () => {
    if (jobs.get(hash) === job) killJob(job);
  });
  proc.on("exit", () => {
    if (job.proc === proc) job.proc = null;
  });
  jobs.set(hash, job);
  return job;
}

export type LiveRemuxResult = {
  status: number;
  body: string | Uint8Array | null;
  contentType: string;
  extraHeaders?: Record<string, string>;
};

function segmentQueryPath(requestUrl: string): string {
  const url = new URL(requestUrl);
  url.searchParams.delete("media");
  return `${url.pathname}${url.search}`;
}

export async function handleLiveCopyRemux(opts: {
  requestUrl: string;
  upstream: string;
  media: string | null;
  head: boolean;
  mode?: LiveRemuxMode;
}): Promise<LiveRemuxResult> {
  if (!isLiveCopyRemuxEnabled()) {
    return {
      status: 503,
      body: "Live stabilize is turned off.",
      contentType: "text/plain",
    };
  }
  if (!/^https?:\/\//i.test(opts.upstream)) {
    return {
      status: 400,
      body: "Invalid upstream URL",
      contentType: "text/plain",
    };
  }

  const mediaName = liveRemuxMediaBasename(opts.media);
  if (opts.media && !mediaName) {
    return { status: 400, body: "Invalid segment", contentType: "text/plain" };
  }

  let job: Job | "busy" | "no-ffmpeg";
  try {
    job = await ensureJob(opts.upstream, opts.mode === "browser" ? "browser" : "copy");
  } catch {
    return {
      status: 503,
      body: "Live stabilize is unavailable.",
      contentType: "text/plain",
    };
  }
  if (job === "busy") {
    return {
      status: 503,
      body: "Live stabilize is busy.",
      contentType: "text/plain",
      extraHeaders: { "retry-after": "3" },
    };
  }
  if (job === "no-ffmpeg") {
    return {
      status: 503,
      body: "Live stabilize is unavailable.",
      contentType: "text/plain",
    };
  }

  job.lastAccessMs = Date.now();
  const root = path.resolve(job.dir);

  if (mediaName) {
    const file = path.resolve(root, mediaName);
    if (!file.startsWith(root + path.sep)) {
      return { status: 400, body: "Invalid segment", contentType: "text/plain" };
    }
    try {
      const data = await readFile(file);
      return {
        status: 200,
        body: opts.head ? null : data,
        contentType: "video/mp2t",
      };
    } catch {
      return { status: 404, body: "Segment not ready", contentType: "text/plain" };
    }
  }

  const ready = await job.ready;
  const playlistPath = path.join(job.dir, "index.m3u8");
  let text = "";
  try {
    text = await readFile(playlistPath, "utf8");
  } catch {
    text = "";
  }
  if (!ready && !text.includes("#EXTINF")) {
    return {
      status: 503,
      body: "Live stabilize is not ready.",
      contentType: "text/plain",
      extraHeaders: { "retry-after": "2" },
    };
  }
  const rewritten = rewriteLiveRemuxPlaylist(text, segmentQueryPath(opts.requestUrl));
  return {
    status: 200,
    body: opts.head ? null : rewritten,
    contentType: "application/vnd.apple.mpegurl",
    extraHeaders: { "cache-control": "no-store" },
  };
}
