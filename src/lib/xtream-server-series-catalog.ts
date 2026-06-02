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
  const categories = normalizeCategoriesPayload(
    await fetchXtreamUpstreamJson(
      creds,
      { action: "get_series_categories" },
      { signal }
    )
  );

  if (!categories.length) {
    return bundleSeriesWithIndex([], []);
  }

  const direct = asSeriesArray(
    await fetchXtreamUpstreamJson(creds, { action: "get_series" }, { signal })
  );

  const streams =
    direct.length > 0
      ? direct.slice(0, MAX_SERIES_CATALOG_ITEMS)
      : await mergeSeriesByCategory(creds, categories, signal);

  return bundleSeriesWithIndex(categories, streams);
}
