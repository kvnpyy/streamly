import { fetchXtreamUpstreamJson, type XtreamServerCreds } from "@/lib/xtream-server-upstream";
import {
  finalizeLiveCatalogAsync,
  MAX_LIVE_CATALOG_STREAMS,
  normalizeLiveStreamsPayloadAsync,
} from "@/lib/xtream-live-catalog";
import { buildLiveCategoryCounts } from "@/lib/live-category-counts";
import { buildStreamIdsByCategory } from "@/lib/live-stream-index";
import { normalizeCategoriesPayload } from "@/lib/xtream";
import type { Category, LiveStream } from "@/lib/xtream-types";

const CATEGORY_FETCH_CONCURRENCY = 4;

function bundleWithCounts(
  categories: Category[],
  streams: LiveStream[]
): {
  categories: Category[];
  streams: LiveStream[];
  countByCategoryId: Record<string, number>;
  streamIdsByCategory: Record<string, number[]>;
} {
  const allowed = new Set(categories.map((c) => String(c.category_id)));
  return {
    categories,
    streams,
    countByCategoryId: buildLiveCategoryCounts(streams, {
      hideAdult: false,
      parentalUnlocked: true,
      allowedCatIds: allowed,
    }),
    streamIdsByCategory: buildStreamIdsByCategory(streams),
  };
}

/** Server-side live catalogue merge (same strategy as the browser client). */
export async function fetchLiveCatalogOnServer(
  creds: XtreamServerCreds,
  opts?: { signal?: AbortSignal }
): Promise<{
  categories: Category[];
  streams: LiveStream[];
  countByCategoryId: Record<string, number>;
  streamIdsByCategory: Record<string, number[]>;
}> {
  const signal = opts?.signal;
  const categories = normalizeCategoriesPayload(
    await fetchXtreamUpstreamJson(
      creds,
      { action: "get_live_categories" },
      { signal }
    )
  );

  const rawAll = await fetchXtreamUpstreamJson(
    creds,
    { action: "get_live_streams" },
    { signal }
  );
  const direct = await normalizeLiveStreamsPayloadAsync(
    rawAll,
    creds.server,
    signal
  );
  if (direct.length > 0) {
    return bundleWithCounts(
      categories,
      await finalizeLiveCatalogAsync(direct, signal)
    );
  }

  if (!categories.length) {
    return {
      categories: [],
      streams: [],
      countByCategoryId: {},
      streamIdsByCategory: {},
    };
  }

  const merged: LiveStream[] = [];
  for (let i = 0; i < categories.length; i += CATEGORY_FETCH_CONCURRENCY) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (merged.length >= MAX_LIVE_CATALOG_STREAMS) break;

    const slice = categories.slice(i, i + CATEGORY_FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(
      slice.map(async (cat) =>
        normalizeLiveStreamsPayloadAsync(
          await fetchXtreamUpstreamJson(
            creds,
            {
              action: "get_live_streams",
              category_id: cat.category_id,
            },
            { signal }
          ),
          creds.server,
          signal
        )
      )
    );
    for (const r of settled) {
      if (r.status === "fulfilled") merged.push(...r.value);
    }
  }

  return bundleWithCounts(
    categories,
    await finalizeLiveCatalogAsync(merged, signal)
  );
}
