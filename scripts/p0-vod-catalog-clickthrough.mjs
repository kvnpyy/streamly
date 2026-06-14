#!/usr/bin/env node
/**
 * P0 VOD catalog click-through — slim catalog + paginated items (Movies/Series).
 * Run: node scripts/p0-vod-catalog-clickthrough.mjs
 */
import { chromium } from "playwright";
import { setTimeout as delay } from "node:timers/promises";

const BASE = process.env.P0_TEST_BASE_URL ?? "http://127.0.0.1:3000";

const MOCK_CREDS = {
  server: "http://mock-panel.local",
  username: "demo",
  password: "demo",
};

const MOCK_VOD_SLIM = {
  categories: [
    { category_id: "10", category_name: "Action", parent_id: 0 },
    { category_id: "20", category_name: "Comedy", parent_id: 0 },
  ],
  countByCategoryId: { "10": 2, "20": 1 },
};

const MOCK_VOD_ITEMS = [
  {
    stream_id: 501,
    name: "Mock Action One",
    category_id: "10",
    stream_icon: "",
    rating: "8.0",
    year: "2024",
  },
  {
    stream_id: 502,
    name: "Mock Action Two",
    category_id: "10",
    stream_icon: "",
    rating: "7.5",
    year: "2023",
  },
  {
    stream_id: 503,
    name: "Mock Comedy Hit",
    category_id: "20",
    stream_icon: "",
    rating: "6.5",
    year: "2022",
  },
];

const MOCK_SERIES_SLIM = {
  categories: [
    { category_id: "5", category_name: "Drama", parent_id: 0 },
  ],
  countByCategoryId: { "5": 2 },
};

const MOCK_SERIES_ITEMS = [
  {
    series_id: 901,
    name: "Mock Drama Alpha",
    category_id: "5",
    cover: "",
    rating: "9.0",
    year: "2024",
  },
  {
    series_id: 902,
    name: "Mock Drama Beta",
    category_id: "5",
    cover: "",
    rating: "8.0",
    year: "2023",
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
    } catch {
      /* noop */
    }
  }, authStoragePayload());
}

function filterVodItems(url) {
  const u = new URL(url);
  const q = u.searchParams.get("q")?.toLowerCase() ?? "";
  const categoryId = u.searchParams.get("categoryId") ?? "all";
  let items = [...MOCK_VOD_ITEMS];
  if (categoryId !== "all") {
    items = items.filter((m) => String(m.category_id) === categoryId);
  }
  if (q) items = items.filter((m) => m.name.toLowerCase().includes(q));
  const limit = Number(u.searchParams.get("limit")) || 120;
  return { items: items.slice(0, limit), total: items.length, offset: 0, limit };
}

function movieShelfDto(m) {
  return {
    id: m.stream_id,
    href: `/app/movies/${m.stream_id}`,
    poster: m.stream_icon,
    title: m.name,
    subtitle: m.year,
    rating: m.rating,
  };
}

function seriesShelfDto(s) {
  return {
    id: s.series_id,
    href: `/app/series/${s.series_id}`,
    poster: s.cover,
    title: s.name,
    subtitle: s.year,
    rating: s.rating,
  };
}

const MOCK_VOD_DISCOVERY_SHELVES = {
  topRated: MOCK_VOD_ITEMS.map(movieShelfDto),
  newlyAdded: MOCK_VOD_ITEMS.map(movieShelfDto),
  forYou: [],
  trending: [],
  genreShelves: [],
  trendingSynced: false,
};

const MOCK_SERIES_DISCOVERY_SHELVES = {
  topRated: MOCK_SERIES_ITEMS.map(seriesShelfDto),
  newlyAdded: MOCK_SERIES_ITEMS.map(seriesShelfDto),
  forYou: [],
  trending: [],
  genreShelves: [],
  trendingSynced: false,
};

async function wireMocks(page) {
  await page.route("**/api/iptv/session**", async (route) => {
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
  await page.route("**/api/vod/catalog**", async (route) => {
    const slim =
      route.request().headers()["x-vod-catalog-slim"] === "1" ||
      route.request().url().includes("slim=1");
    const body = slim
      ? MOCK_VOD_SLIM
      : { ...MOCK_VOD_SLIM, streams: MOCK_VOD_ITEMS, idsByCategory: { "10": [501, 502], "20": [503] } };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.route("**/api/vod/items**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(filterVodItems(route.request().url())),
    });
  });
  await page.route("**/api/series/catalog**", async (route) => {
    const slim =
      route.request().headers()["x-series-catalog-slim"] === "1" ||
      route.request().url().includes("slim=1");
    const body = slim
      ? MOCK_SERIES_SLIM
      : {
          ...MOCK_SERIES_SLIM,
          streams: MOCK_SERIES_ITEMS,
          idsByCategory: { "5": [901, 902] },
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.route("**/api/series/items**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: MOCK_SERIES_ITEMS,
        total: MOCK_SERIES_ITEMS.length,
        offset: 0,
        limit: 120,
      }),
    });
  });
  await page.route("**/api/vod/discovery-shelves**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_VOD_DISCOVERY_SHELVES),
    });
  });
  await page.route("**/api/series/discovery-shelves**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SERIES_DISCOVERY_SHELVES),
    });
  });
  await page.route("**/api/discovery/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ movieTrending: [], tvTrending: [] }),
    });
  });
  await page.route("**/api/xtream**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.route("**/api/favorites**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/watch-state**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function openGenrePicker(page) {
  await page.getByRole("button", { name: /All Genres|Action|Comedy|Drama/i }).first().click();
  await page.getByRole("listbox", { name: "Genres" }).waitFor({ state: "visible", timeout: 5000 });
}

async function pickGenre(page, name) {
  await openGenrePicker(page);
  const inline = page.getByRole("option", { name: new RegExp(`^${name}$`, "i") });
  if ((await inline.count()) > 0) {
    await inline.first().click();
    return;
  }
  await page.getByRole("button", { name: /Browse all categories/i }).click();
  const dialog = page.getByRole("dialog", { name: "Browse genres" });
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await dialog.getByRole("option", { name: new RegExp(name, "i") }).first().click();
}

async function gotoMovies(page) {
  await page.goto(`${BASE}/app/movies`, { waitUntil: "commit", timeout: 60000 });
  await page.getByRole("heading", { name: "Movies", level: 1 }).waitFor({
    state: "visible",
    timeout: 30000,
  });
  await delay(800);
}

async function gotoSeries(page) {
  await page.goto(`${BASE}/app/series`, { waitUntil: "commit", timeout: 60000 });
  await page.getByRole("heading", { name: "Series", level: 1 }).waitFor({
    state: "visible",
    timeout: 30000,
  });
  await delay(800);
}

async function runTest(id, fn) {
  try {
    return await fn();
  } catch (err) {
    return { id, pass: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const results = [];
  const browser = await chromium.launch({ headless: true });

  try {
    results.push(
      await runTest("P0-VOD-1-movies-slim-grid", async () => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        try {
          const page = await ctx.newPage();
          const catalogRequests = [];
          const itemsRequests = [];
          page.on("request", (req) => {
            const url = req.url();
            if (url.includes("/api/vod/catalog")) catalogRequests.push(req);
            if (url.includes("/api/vod/items")) itemsRequests.push(url);
          });
          await wireMocks(page);
          await seedAuth(page);
          await gotoMovies(page);
          await page.getByText("Mock Action One").first().waitFor({ state: "visible", timeout: 20000 });
          const usedSlim = catalogRequests.some(
            (req) =>
              req.url().includes("slim=1") ||
              req.headers()["x-vod-catalog-slim"] === "1"
          );
          const usedItems = itemsRequests.length > 0;
          const bulkPreview = itemsRequests.some((u) => /limit=(600|800)/.test(u));
          const pagedGrid = itemsRequests.some((u) => /limit=120/.test(u));
          return {
            id: "P0-VOD-1-movies-slim-grid",
            pass: usedSlim && usedItems && !bulkPreview && pagedGrid,
            detail: `slim=${usedSlim} items=${usedItems} page120=${pagedGrid} noBulk=${!bulkPreview} catalogHits=${catalogRequests.length}`,
          };
        } finally {
          await ctx.close();
        }
      })
    );

    results.push(
      await runTest("P0-VOD-2-movies-category", async () => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        try {
          const page = await ctx.newPage();
          await wireMocks(page);
          await seedAuth(page);
          await gotoMovies(page);
          await pickGenre(page, "Comedy");
          await page.getByText("Mock Comedy Hit").first().waitFor({ state: "visible", timeout: 15000 });
          await delay(300);
          const actionCount = await page.getByText("Mock Action One").count();
          const actionHidden = actionCount === 0;
          return {
            id: "P0-VOD-2-movies-category",
            pass: actionHidden,
            detail: `comedyVisible=true actionHidden=${actionHidden}`,
          };
        } finally {
          await ctx.close();
        }
      })
    );

    results.push(
      await runTest("P0-VOD-3-movies-search", async () => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        try {
          const page = await ctx.newPage();
          await wireMocks(page);
          await seedAuth(page);
          await gotoMovies(page);
          await page.getByLabel("Search movies").fill("Comedy");
          await page.getByText("Mock Comedy Hit").first().waitFor({ state: "visible", timeout: 15000 });
          return { id: "P0-VOD-3-movies-search", pass: true, detail: "search hit visible" };
        } finally {
          await ctx.close();
        }
      })
    );

    results.push(
      await runTest("P0-VOD-4-series-slim-grid", async () => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        try {
          const page = await ctx.newPage();
          await wireMocks(page);
          await seedAuth(page);
          await gotoSeries(page);
          await page.getByText("Mock Drama Alpha").first().waitFor({ state: "visible", timeout: 20000 });
          return { id: "P0-VOD-4-series-slim-grid", pass: true, detail: "series grid visible" };
        } finally {
          await ctx.close();
        }
      })
    );
  } finally {
    await browser.close();
  }

  let failed = 0;
  for (const r of results) {
    const mark = r.pass ? "PASS" : "FAIL";
    console.log(`${mark}  ${r.id}  ${r.detail ?? ""}`);
    if (!r.pass) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
