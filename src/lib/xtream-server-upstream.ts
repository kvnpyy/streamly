import {
  getXtreamUpstreamCached,
  setXtreamUpstreamCached,
  xtreamUpstreamCacheKey,
} from "@/lib/xtream-upstream-cache";
import { isXtreamCatalogCacheAction } from "@/lib/xtream-catalog-cache";
import { EMPTY_XTREAM_EPG, isXtreamEpgAction } from "@/lib/xtream-epg-actions";
import { tryHandleReviewPanelRequest } from "@/lib/review-panel/handler";

import { normalizeServer } from "@/lib/utils";
import { fetchXtreamPanelWithRetry } from "@/lib/xtream-upstream-fetch";

const UPSTREAM_TIMEOUT_MS = 30_000;

export type XtreamServerCreds = {
  server: string;
  username: string;
  password: string;
};

export async function fetchXtreamUpstreamJson(
  creds: XtreamServerCreds,
  params: Record<string, string>,
  opts?: { signal?: AbortSignal }
): Promise<unknown> {
  const action = params.action ?? null;
  const review = tryHandleReviewPanelRequest(creds, params);
  if (review !== null) {
    return review;
  }

  const cacheKey = xtreamUpstreamCacheKey(creds, params);
  const cacheable = isXtreamCatalogCacheAction(action) || isXtreamEpgAction(action);

  if (cacheable) {
    const hit = getXtreamUpstreamCached(cacheKey);
    if (hit) {
      try {
        return JSON.parse(hit) as unknown;
      } catch {
        /* corrupt entry — refetch */
      }
    }
  }

  const server = normalizeServer(creds.server);
  const upstream = new URL(`${server}/player_api.php`);
  upstream.searchParams.set("username", creds.username);
  upstream.searchParams.set("password", creds.password);
  for (const [k, v] of Object.entries(params)) {
    if (v) upstream.searchParams.set(k, v);
  }

  const res = await fetchXtreamPanelWithRetry(upstream.toString(), {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 IPTVSmartersPlayer/3.1.5",
      Accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
    signal: opts?.signal ?? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    console.warn(`[upstream ${action || "auth"}] upstream error status ${res.status}`);
    if (isXtreamEpgAction(action)) return EMPTY_XTREAM_EPG;
    if (action === "get_series_categories" || action === "get_series") return [];
    if (action === "get_vod_categories" || action === "get_vod_streams") return [];
    throw new Error(`upstream ${res.status}`);
  }

  if (cacheable) {
    setXtreamUpstreamCached(cacheKey, text, action);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.warn(`[upstream ${action || "auth"}] failed to parse response JSON:`, text.slice(0, 100));
    if (isXtreamEpgAction(action)) return EMPTY_XTREAM_EPG;
    if (action === "get_series_categories" || action === "get_series") return [];
    if (action === "get_vod_categories" || action === "get_vod_streams") return [];
    throw new Error("upstream json parse failed");
  }
}
