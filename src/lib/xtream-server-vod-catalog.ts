import { fetchXtreamUpstreamJson, type XtreamServerCreds } from "@/lib/xtream-server-upstream";
import { normalizeCategoriesPayload } from "@/lib/xtream";
import { bundleVodWithIndex, type VodCatalogBundle } from "@/lib/vod-catalog-bundle";
import type { Category, VodStream } from "@/lib/xtream-types";
import { yieldToMain } from "@/lib/yield-to-main";

const CATEGORY_FETCH_CONCURRENCY = 4;
export const MAX_VOD_CATALOG_STREAMS = 25_000;

function asVodArray(raw: unknown): VodStream[] {
  if (!Array.isArray(raw)) return [];
  return raw as VodStream[];
}

async function mergeVodByCategory(
  creds: XtreamServerCreds,
  categories: Category[],
  signal?: AbortSignal
): Promise<VodStream[]> {
  const merged: VodStream[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < categories.length; i += CATEGORY_FETCH_CONCURRENCY) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (merged.length >= MAX_VOD_CATALOG_STREAMS) break;

    const slice = categories.slice(i, i + CATEGORY_FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      slice.map((cat) =>
        fetchXtreamUpstreamJson(
          creds,
          { action: "get_vod_streams", category_id: String(cat.category_id) },
          { signal }
        )
      )
    );

    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      for (const row of asVodArray(r.value)) {
        const id = Number(row.stream_id);
        if (!Number.isFinite(id) || seen.has(id)) continue;
        seen.add(id);
        merged.push(row);
        if (merged.length >= MAX_VOD_CATALOG_STREAMS) break;
      }
    }
    await yieldToMain();
  }

  return merged;
}

/** VPS-built movie catalogue (categories + merged streams + indexes). */
export async function fetchVodCatalogOnServer(
  creds: XtreamServerCreds,
  opts?: { signal?: AbortSignal }
): Promise<VodCatalogBundle> {
  const signal = opts?.signal;
  const categories = normalizeCategoriesPayload(
    await fetchXtreamUpstreamJson(
      creds,
      { action: "get_vod_categories" },
      { signal }
    )
  );

  if (!categories.length) {
    return bundleVodWithIndex([], []);
  }

  const direct = asVodArray(
    await fetchXtreamUpstreamJson(creds, { action: "get_vod_streams" }, { signal })
  );

  const streams =
    direct.length > 0
      ? direct.slice(0, MAX_VOD_CATALOG_STREAMS)
      : await mergeVodByCategory(creds, categories, signal);

  return bundleVodWithIndex(categories, streams);
}
