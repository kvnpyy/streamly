import "server-only";

import {
  segmentAtPlaylistTime,
  VOD_TRANSCODE_SEGMENT_RE,
} from "@/lib/vod-transcode-manifest";
import {
  upstreamEligibleForVodTranscode,
  vodTranscodeJobDir,
} from "@/lib/vod-transcode-paths";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

const IPTV_UA_VOD = "VLC/3.0.20 LibVLC/3.0.20";
const BUCKET_SEC = 8;
const CACHE_TTL_MS = 60 * 60_000;
const EXTRACT_TIMEOUT_MS = 14_000;

type CacheEntry = { buf: Buffer; at: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Buffer | null>>();

function ffmpegPath(): string {
  return process.env.STREAM_FFMPEG_PATH?.trim() || "ffmpeg";
}

function upstreamReferer(upstreamUrl: string): string {
  try {
    const u = new URL(upstreamUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

function cacheKey(upstream: string, bucketSec: number): string {
  return crypto
    .createHash("sha256")
    .update(`${upstream}|${bucketSec}`)
    .digest("hex");
}

function bucketSec(sec: number): number {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / BUCKET_SEC) * BUCKET_SEC;
}

async function extractFrameFile(
  inputPath: string,
  offsetSec: number
): Promise<Buffer | null> {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-ss",
    offsetSec.toFixed(3),
    "-frames:v",
    "1",
    "-vf",
    "scale=320:-2",
    "-q:v",
    "6",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "pipe:1",
  ];
  return runFfmpeg(args);
}

/**
 * Frame from the encode already on disk. Seeking the provider file with
 * ffmpeg returns "Server returned 404 Not Found" on most IPTV panels, and
 * the browser then logs that as a missing file while the bar is scrubbed.
 */
async function extractLocalTranscodeFrame(
  upstream: string,
  atSec: number
): Promise<{ segmentExists: boolean; buf: Buffer | null }> {
  const dir = vodTranscodeJobDir(upstream, 0);
  let manifest: string;
  try {
    manifest = await fs.readFile(path.join(dir, "index.m3u8"), "utf8");
  } catch {
    return { segmentExists: false, buf: null };
  }
  const hit = segmentAtPlaylistTime(manifest, atSec);
  if (!hit || !VOD_TRANSCODE_SEGMENT_RE.test(hit.name)) {
    return { segmentExists: false, buf: null };
  }
  const segPath = path.join(dir, hit.name);
  try {
    await fs.access(segPath);
  } catch {
    return { segmentExists: false, buf: null };
  }
  const offset = Math.min(hit.offsetSec, 3.5);
  if (hit.name.endsWith(".ts")) {
    return { segmentExists: true, buf: await extractFrameFile(segPath, offset) };
  }
  const tmp = path.join(
    os.tmpdir(),
    `vod-preview-${crypto.randomBytes(8).toString("hex")}.mp4`
  );
  try {
    const [init, seg] = await Promise.all([
      fs.readFile(path.join(dir, "init.mp4")),
      fs.readFile(segPath),
    ]);
    await fs.writeFile(tmp, Buffer.concat([init, seg]));
    return { segmentExists: true, buf: await extractFrameFile(tmp, offset) };
  } catch {
    return { segmentExists: true, buf: null };
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}

function runFfmpeg(args: string[]): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath(), args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, EXTRACT_TIMEOUT_MS);
    proc.stdout?.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr?.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-400);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || chunks.length === 0) {
        if (process.env.NODE_ENV !== "production" && stderr) {
          console.warn("[vod-thumbnail]", stderr.trim());
        }
        resolve(null);
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

async function extractFrame(upstream: string, atSec: number): Promise<Buffer | null> {
  const referer = upstreamReferer(upstream);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(atSec),
    "-probesize",
    "5M",
    "-analyzeduration",
    "1.5M",
    "-user_agent",
    IPTV_UA_VOD,
  ];
  if (referer) args.push("-headers", `Referer: ${referer}\r\n`);
  args.push(
    "-i",
    upstream,
    "-frames:v",
    "1",
    "-vf",
    "scale=320:-2",
    "-q:v",
    "6",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "pipe:1"
  );

  return runFfmpeg(args);
}

export async function getVodSeekPreviewJpeg(
  upstream: string,
  sec: number
): Promise<Buffer | null> {
  if (!upstreamEligibleForVodTranscode(upstream)) return null;
  const at = bucketSec(sec);
  const key = cacheKey(upstream, at);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.buf;

  const pending = inflight.get(key);
  if (pending) return pending;

  const work = (async () => {
    try {
      const local = await extractLocalTranscodeFrame(upstream, at);
      const buf =
        local.buf && local.buf.length > 500
          ? local.buf
          : local.segmentExists
            ? null
            : await extractFrame(upstream, at);
      if (buf && buf.length > 500) {
        cache.set(key, { buf, at: Date.now() });
        if (cache.size > 400) {
          const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          if (oldest) cache.delete(oldest[0]);
        }
      }
      return buf;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, work);
  return work;
}
