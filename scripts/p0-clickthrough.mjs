#!/usr/bin/env node
/**
 * P0 click-through smoke tests (Playwright).
 * Run: node scripts/p0-clickthrough.mjs
 * Requires: npx playwright (installs chromium on first run).
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const BASE = process.env.P0_TEST_BASE_URL ?? "http://127.0.0.1:3000";
const SAMSUNG_UA =
  "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/120.0.0.0 TV Safari/537.36";
const SILK_UA =
  "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Silk/120.0.0.0";

const MOCK_CREDS = {
  server: "http://mock-panel.local",
  username: "demo",
  password: "demo",
};

const MOCK_SLIM_CATALOG = {
  categories: [
    { category_id: "1", category_name: "News", parent_id: 0 },
    { category_id: "2", category_name: "Sports", parent_id: 0 },
  ],
  countByCategoryId: { "1": 2, "2": 1 },
};

const MOCK_STREAMS = [
  {
    stream_id: 101,
    name: "Mock News HD",
    category_id: "1",
    stream_icon: "",
    epg_channel_id: "news1",
    direct_source: "",
  },
  {
    stream_id: 102,
    name: "Mock World",
    category_id: "1",
    stream_icon: "",
    epg_channel_id: "news2",
    direct_source: "",
  },
];

function authStoragePayload() {
  return JSON.stringify({
    state: {
      creds: MOCK_CREDS,
      account: {
        user_info: { status: "Active", max_connections: "1", is_trial: "0" },
        server_info: { time_now: "2026-06-13" },
      },
    },
    version: 1,
  });
}

async function seedAuth(page) {
  await page.addInitScript((payload) => {
    const creds = { server: "http://mock-panel.local", username: "demo", password: "demo" };
    const account = {
      user_info: { status: "Active", max_connections: "1", is_trial: "0" },
      server_info: { time_now: "2026-06-13" },
    };
    try {
      localStorage.setItem("iptv-auth", payload);
      sessionStorage.setItem(
        "iptv-auth-bridge-v1",
        JSON.stringify({ creds, account, at: Date.now() })
      );
      sessionStorage.removeItem("iptv-dismiss-tv-remote-hints");
    } catch {
      /* noop */
    }
  }, authStoragePayload());
}

async function wireMocks(page) {
  await page.route("**/api/iptv/session**", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 200, body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ creds: MOCK_CREDS }),
    });
  });
  await page.route("**/api/auth/session**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });
  await page.route(/\/api\/live\/catalog(?:\/|$)/, async (route) => {
    const url = route.request().url();
    if (url.includes("/channels")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ streams: MOCK_STREAMS }),
      });
      return;
    }
    if (url.includes("/shelf")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          shelves: [
            {
              id: "1",
              title: "News",
              preview: MOCK_STREAMS,
              total: MOCK_STREAMS.length,
            },
          ],
          nextOffset: 2,
          hasMore: false,
          totalCategories: 2,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SLIM_CATALOG),
    });
  });
  await page.route("**/api/xtream**", async (route) => {
    const url = route.request().url();
    if (url.includes("get_short_epg") || url.includes("get_simple_data_table")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ epg_listings: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user_info: { status: "Active" },
        server_info: { time_now: "2026-06-13" },
      }),
    });
  });
  await page.route("**/api/discovery/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });
  await page.route("**/api/favorites**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/watch-state**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function gotoLiveApp(page, { retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(`${BASE}/app/live`, {
        waitUntil: "commit",
        timeout: 60000,
      });
      if (!/\/app\/live/.test(page.url())) {
        throw new Error(`Expected /app/live but landed on ${page.url()}`);
      }
      await page
        .locator('h1:not(.sr-only)', { hasText: "Live TV" })
        .first()
        .waitFor({ state: "visible", timeout: 30000 });
      await page.waitForTimeout(500);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await delay(1500);
    }
  }
  throw lastErr;
}

async function isVisible(locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function playMockNewsChannel(page) {
  const playBtn = () => page.getByRole("button", { name: /Play.*Mock News HD/i }).first();
  if (await isVisible(playBtn())) {
    await playBtn().evaluate((el) => el.click());
  } else {
    const channel = page.getByText("Mock News HD").first();
    await channel.waitFor({ state: "visible", timeout: 25000 });
    await channel.click();
  }
  await page
    .locator("[data-player-controls]")
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => {});
}

async function runTest(id, fn) {
  try {
    return await fn();
  } catch (err) {
    return { id, pass: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function runTests() {
  const results = [];
  console.log("Launching browser…");
  const browser = await chromium.launch({ headless: true });
  console.log("Browser ready — running P0 cases…");

  try {
    results.push(
      await runTest("P0-2-tablet-bottom-nav", async () => {
        const ctx = await browser.newContext({
          viewport: { width: 834, height: 1194 },
          userAgent:
            "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        });
        try {
          const page = await ctx.newPage();
          await wireMocks(page);
          await seedAuth(page);
          await gotoLiveApp(page);

          const bottomNav = page.getByRole("navigation", { name: "Main navigation" });
          const sidebar = page
            .locator("aside")
            .filter({ has: page.getByText("Home", { exact: true }) });
          const bottomVisible = await isVisible(bottomNav);
          const sidebarVisible = await isVisible(sidebar.first());
          const pass = bottomVisible && !sidebarVisible;
          return {
            id: "P0-2-tablet-bottom-nav",
            pass,
            detail: `bottomNav=${bottomVisible} sidebar=${sidebarVisible}`,
          };
        } finally {
          await ctx.close();
        }
      })
    );

    results.push(
      await runTest("P0-2-desktop-sidebar", async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
        try {
          const page = await ctx.newPage();
          await wireMocks(page);
          await seedAuth(page);
          await gotoLiveApp(page);

          const bottomNav = page.getByRole("navigation", { name: "Main navigation" });
          const sidebar = page.locator("aside");
          const bottomVisible = await isVisible(bottomNav);
          const sidebarVisible = await isVisible(sidebar.first());
          const pass = sidebarVisible && !bottomVisible;
          return {
            id: "P0-2-desktop-sidebar",
            pass,
            detail: `bottomNav=${bottomVisible} sidebar=${sidebarVisible}`,
          };
        } finally {
          await ctx.close();
        }
      })
    );

    results.push(
      await runTest("P0-1-tv-browse-default", async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: SAMSUNG_UA,
        });
        try {
          const page = await ctx.newPage();
          await wireMocks(page);
          await seedAuth(page);
          await gotoLiveApp(page);
          const categoriesBtn = page.getByRole("button", {
            name: "Open category browser",
          });
          const search = page.getByLabel("Search channels or programs");
          const guideToggle = page.getByRole("group", { name: "Live layout" });
          const hasCategories = await isVisible(categoriesBtn);
          const hasSearch = await isVisible(search.first());
          const guideToggleVisible =
            (await guideToggle.count()) > 0 &&
            (await isVisible(guideToggle.first()));
          const mockChannel = page.getByText("Mock News HD");
          const hasBrowseShelf = await isVisible(mockChannel.first());
          return {
            id: "P0-1-tv-browse-default",
            pass:
              hasCategories &&
              hasSearch &&
              !guideToggleVisible &&
              hasBrowseShelf,
            detail: `categories=${hasCategories} search=${hasSearch} guideToggle=${guideToggleVisible} shelf=${hasBrowseShelf}`,
          };
        } finally {
          await ctx.close();
        }
      })
    );

    results.push(
      await runTest("P0-4-tv-player-close", async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: SAMSUNG_UA,
        });
        try {
          const page = await ctx.newPage();
          await wireMocks(page);
          await seedAuth(page);
          await page.route("**/api/stream**", async (route) => {
            await route.fulfill({
              status: 200,
              contentType: "application/vnd.apple.mpegurl",
              body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\nhttps://example.com/seg.ts\n#EXT-X-ENDLIST\n",
            });
          });
          await gotoLiveApp(page);
          await playMockNewsChannel(page);
          const closeBtn = page
            .getByRole("button", { name: /^Close( player)?$/i })
            .first();
          await closeBtn.waitFor({ state: "visible", timeout: 15000 });
          await closeBtn.click();
          await page
            .getByText("Mock News HD")
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          const channelBtn = page.getByRole("button", {
            name: /Play.*Mock News HD/i,
          });
          const canInteract =
            (await channelBtn.count()) > 0
              ? await channelBtn.first().isEnabled()
              : await page.getByText("Mock News HD").first().isVisible();
          return {
            id: "P0-4-tv-player-close",
            pass: canInteract,
            detail: `browseInteractiveAfterClose=${canInteract}`,
          };
        } finally {
          await ctx.close();
        }
      })
    );

    results.push(
      await runTest("P0-3-silk-remote-hints", async () => {
        await delay(1500);
        const ctx = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: SILK_UA,
        });
        try {
          const page = await ctx.newPage();
          await wireMocks(page);
          await seedAuth(page);
          await page.route("**/api/stream**", async (route) => {
            await route.fulfill({
              status: 200,
              contentType: "application/vnd.apple.mpegurl",
              body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\nhttps://example.com/seg.ts\n#EXT-X-ENDLIST\n",
            });
          });
          await gotoLiveApp(page);
          await playMockNewsChannel(page);
          const hints = page.getByText(/OK on video/i);
          const count = await hints.count();
          return {
            id: "P0-3-silk-remote-hints",
            pass: count > 0 && (await isVisible(hints.first())),
            detail: `hintsFound=${count}`,
          };
        } finally {
          await ctx.close();
        }
      })
    );
  } finally {
    await browser.close();
  }

  console.log("\nP0 click-through results:\n");
  let allPass = true;
  for (const r of results) {
    const mark = r.pass ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${r.id} — ${r.detail}`);
    if (!r.pass) allPass = false;
  }
  console.log("");
  if (!allPass) process.exit(1);
  console.log("All P0 click-through tests passed.\n");
}

async function waitForServer(url, ms = 60000) {
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
  const useExternal = Boolean(process.env.P0_TEST_BASE_URL);
  let child = null;
  if (!useExternal) {
    child = spawn("npm", ["run", "dev"], {
      cwd: new URL("..", import.meta.url).pathname.replace(/\/$/, ""),
      stdio: "ignore",
      env: { ...process.env, PORT: "3000" },
    });
    await waitForServer(BASE);
  }
  try {
    await runTests();
  } finally {
    if (child) child.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
