import { fetchXtreamUpstreamJson, type XtreamServerCreds } from "@/lib/xtream-server-upstream";
import { normalizeCategoriesPayload } from "@/lib/xtream";
import {
  bundleSeriesWithIndex,
  type SeriesCatalogBundle,
} from "@/lib/vod-catalog-bundle";
import type { Category, SeriesItem } from "@/lib/xtream-types";
import { parsePositiveRouteId } from "@/lib/utils";
import { yieldToMain } from "@/lib/yield-to-main";

const CATEGORY_FETCH_CONCURRENCY = 4;
export const MAX_SERIES_CATALOG_ITEMS = 20_000;

function asSeriesArray(raw: unknown): SeriesItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => parsePositiveRouteId(s.series_id) != null);
}

async function mergeSeriesByCategory(
  creds: XtreamServerCreds,
  categories: Category[],
  signal?: AbortSignal
): Promise<SeriesItem[]> {
  const merged: SeriesItem[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < categories.length; i += CATEGORY_FETCH_CONCURRENCY) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (merged.length >= MAX_SERIES_CATALOG_ITEMS) break;

    const slice = categories.slice(i, i + CATEGORY_FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      slice.map((cat) =>
        fetchXtreamUpstreamJson(
          creds,
          { action: "get_series", category_id: String(cat.category_id) },
          { signal }
        )
      )
    );

    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      for (const row of asSeriesArray(r.value)) {
        const id = parsePositiveRouteId(row.series_id);
        if (id == null || seen.has(id)) continue;
        seen.add(id);
        merged.push(row);
        if (merged.length >= MAX_SERIES_CATALOG_ITEMS) break;
      }
    }
    await yieldToMain();
  }

  return merged;
}

/** VPS-built series catalogue (categories + merged items + indexes). */
export async function fetchSeriesCatalogOnServer(
  creds: XtreamServerCreds,
  opts?: { signal?: AbortSignal }
): Promise<SeriesCatalogBundle> {
  const signal = opts?.signal;
  let categories: Category[] = [];
  try {
    const rawCategories = await fetchXtreamUpstreamJson(
      creds,
      { action: "get_series_categories" },
      { signal }
    );
    categories = normalizeCategoriesPayload(rawCategories);
  } catch (err) {
    console.warn("[series-catalog] get_series_categories failed:", err);
  }

  let direct: SeriesItem[] = [];
  try {
    const rawDirect = await fetchXtreamUpstreamJson(creds, { action: "get_series" }, { signal });
    direct = asSeriesArray(rawDirect);
  } catch (err) {
    console.warn("[series-catalog] get_series failed:", err);
  }

  if (categories.length === 0 && direct.length === 0) {
    return bundleSeriesWithIndex([], []);
  }

  if (categories.length === 0 && direct.length > 0) {
    const catMap = new Map<string, string>();
    for (const item of direct) {
      if (item.category_id) {
        const catName =
          (item as unknown as { category_name?: string }).category_name ||
          `Category ${item.category_id}`;
        catMap.set(String(item.category_id), catName);
      }
    }
    categories = Array.from(catMap.entries()).map(([category_id, category_name]) => ({
      category_id,
      category_name,
      parent_id: 0,
    }));
  }

  const streams =
    direct.length > 0
      ? direct.slice(0, MAX_SERIES_CATALOG_ITEMS)
      : await mergeSeriesByCategory(creds, categories, signal);

  return bundleSeriesWithIndex(categories, streams);
}
