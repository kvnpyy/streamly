import {
  getXtreamUpstreamCached,
  setXtreamUpstreamCached,
  xtreamUpstreamCacheKey,
} from "@/lib/xtream-upstream-cache";
import { isXtreamCatalogCacheAction } from "@/lib/xtream-catalog-cache";
import { EMPTY_XTREAM_EPG, isXtreamEpgAction } from "@/lib/xtream-epg-actions";

const UPSTREAM_TIMEOUT_MS = 12_000;

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

  const upstream = new URL(`${creds.server}/player_api.php`);
  upstream.searchParams.set("username", creds.username);
  upstream.searchParams.set("password", creds.password);
  for (const [k, v] of Object.entries(params)) {
    if (v) upstream.searchParams.set(k, v);
  }

  const res = await fetch(upstream.toString(), {
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
    if (isXtreamEpgAction(action)) return EMPTY_XTREAM_EPG;
    throw new Error(`upstream ${res.status}`);
  }

  if (cacheable) {
    setXtreamUpstreamCached(cacheKey, text, action);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (isXtreamEpgAction(action)) return EMPTY_XTREAM_EPG;
    throw new Error("upstream json parse failed");
  }
}
