#!/usr/bin/env node
/**
 * Capture Samsung Seller Office screenshots (JPG 1920×1080, ≤500 KB each).
 *
 * Run: npm run tv:store:screenshots
 * Or:  SCREENSHOT_BASE_URL=https://iptvwebplayer.org npm run tv:store:screenshots
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "tv-apps/assets/screenshots/samsung");
const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:3000";
const MAX_BYTES = 500 * 1024;
const VIEWPORT = { width: 1920, height: 1080 };

const SAMSUNG_UA =
  "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/120.0.0.0 TV Safari/537.36";

/** @type {{ file: string; path: string; waitMs?: number }[]} */
const SHOTS = [
  { file: "01-login.jpg", path: "/store-demo/login", waitMs: 1400 },
  { file: "02-live-tv.jpg", path: "/store-demo/live", waitMs: 1600 },
  { file: "03-movie-detail.jpg", path: "/store-demo/movie", waitMs: 1600 },
  { file: "04-tv-home.jpg", path: "/store-demo/home", waitMs: 1800 },
  { file: "05-movies-grid.jpg", path: "/store-demo/movies", waitMs: 1600 },
  { file: "06-series-grid.jpg", path: "/store-demo/series", waitMs: 1600 },
  { file: "07-search.jpg", path: "/store-demo/search", waitMs: 1600 },
  { file: "08-settings.jpg", path: "/store-demo/settings", waitMs: 1600 },
  { file: "09-player.jpg", path: "/store-demo/player", waitMs: 1200 },
];

async function writeJpegUnderLimit(page, outPath, maxBytes) {
  let quality = 92;
  let lastBuffer = null;

  while (quality >= 45) {
    lastBuffer = await page.screenshot({
      type: "jpeg",
      quality,
      fullPage: false,
      animations: "disabled",
    });
    if (lastBuffer.length <= maxBytes) {
      await fs.writeFile(outPath, lastBuffer);
      return { quality, bytes: lastBuffer.length };
    }
    quality -= 4;
  }

  if (!lastBuffer) throw new Error(`Failed to capture ${outPath}`);
  await fs.writeFile(outPath, lastBuffer);
  return { quality: 45, bytes: lastBuffer.length, warning: "over limit" };
}

async function preparePage(page) {
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = `
      nextjs-portal,
      [data-nextjs-dialog-overlay],
      [data-nextjs-toast],
      #__next-build-watcher,
      .nextjs-toast-errors-parent {
        display: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  });
}

async function captureAll() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    userAgent: SAMSUNG_UA,
    colorScheme: "dark",
  });

  const results = [];

  try {
    const page = await ctx.newPage();
    await preparePage(page);

    for (const shot of SHOTS) {
      const url = `${BASE.replace(/\/$/, "")}${shot.path}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await delay(shot.waitMs ?? 1000);
      await page.evaluate(() => document.fonts?.ready);
      await page.evaluate(() => window.scrollTo(0, 0));

      const outPath = path.join(OUT_DIR, shot.file);
      const meta = await writeJpegUnderLimit(page, outPath, MAX_BYTES);
      const kb = (meta.bytes / 1024).toFixed(1);
      const warn = meta.warning ? " ⚠ over 500 KB" : "";
      console.log(`  ✓ ${shot.file} — ${kb} KB (q=${meta.quality})${warn}`);
      results.push({ ...shot, ...meta });
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    viewport: VIEWPORT,
    format: "jpeg",
    maxBytes: MAX_BYTES,
    files: results.map((r) => ({
      file: r.file,
      bytes: r.bytes,
      quality: r.quality,
      route: r.path,
    })),
  };
  await fs.writeFile(
    path.join(OUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  const over = results.filter((r) => r.bytes > MAX_BYTES);
  if (over.length > 0) {
    console.warn(
      `\nWarning: ${over.length} file(s) exceed 500 KB — re-run or lower quality manually.\n`
    );
  } else {
    console.log("\nAll screenshots ready for Samsung Seller Office upload.\n");
  }
}

async function waitForServer(url, ms = 90_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 307 || res.status === 302) return;
    } catch {
      /* retry */
    }
    await delay(500);
  }
  throw new Error(`Server not ready: ${url}`);
}

async function main() {
  const useExternal = Boolean(process.env.SCREENSHOT_BASE_URL);
  let child = null;

  if (!useExternal) {
    console.log("Building production bundle…");
    const build = spawn("npm", ["run", "build"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    await new Promise((resolve, reject) => {
      build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("build failed"))));
    });

    console.log("Starting production server…");
    child = spawn("npm", ["run", "start"], {
      cwd: ROOT,
      stdio: "ignore",
      env: { ...process.env, PORT: "3000" },
    });
    await waitForServer(BASE);
  } else {
    console.log(`Capturing from ${BASE}…`);
  }

  try {
    console.log(`\nSamsung store screenshots → ${OUT_DIR}\n`);
    await captureAll();
  } finally {
    if (child) child.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
