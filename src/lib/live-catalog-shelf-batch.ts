import type { LiveShelfMeta } from "@/lib/live-category-shelf";
import type { TvRegion } from "@/lib/geo-continent";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";

export type ShelfBatchItem = {
  id: string;
  title: string;
  preview: LiveStream[];
  total: number;
};

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

export type ShelfBatchResponse = {
  shelves: ShelfBatchItem[];
  nextOffset: number;
  hasMore: boolean;
  /** Categories in this region that have at least one channel. */
  totalCategories: number;
  /** Upstream catalog could not be loaded — UI should show retry, not throw. */
  catalogUnavailable?: boolean;
};

export const SHELF_CATALOG_UNAVAILABLE_MSG =
  "Live TV categories are temporarily unavailable. Try again shortly.";

const RETRYABLE_STATUSES = new Set([502, 503, 504, 429]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchLiveShelfBatch(
  creds: XtreamCredentials,
  opts: {
    region: TvRegion;
    offset: number;
    count: number;
    limitPerShelf: number;
    signal?: AbortSignal;
  }
): Promise<ShelfBatchResponse> {
  const url = new URL(
    `${typeof window !== "undefined" ? window.location.origin : ""}/api/live/catalog/shelf-batch`
  );
  url.searchParams.set("region", opts.region);
  url.searchParams.set("offset", String(opts.offset));
  url.searchParams.set("count", String(opts.count));
  url.searchParams.set("limit", String(opts.limitPerShelf));

  for (let attempt = 0; attempt < 3; attempt++) {
    if (opts.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: catalogHeaders(creds),
      signal: opts.signal,
      cache: "default",
    });
    if (res.ok) {
      const data = (await res.json()) as ShelfBatchResponse;
      if (data.catalogUnavailable) {
        return {
          shelves: [],
          nextOffset: opts.offset,
          hasMore: false,
          totalCategories: 0,
          catalogUnavailable: true,
        };
      }
      return data;
    }
    if (!RETRYABLE_STATUSES.has(res.status) || attempt >= 2) break;
    await sleep(350 * (attempt + 1));
  }
  return {
    shelves: [],
    nextOffset: opts.offset,
    hasMore: false,
    totalCategories: 0,
    catalogUnavailable: true,
  };
}

export function shelfBatchToMeta(items: ShelfBatchItem[]): LiveShelfMeta[] {
  return items.map((s) => ({
    id: s.id,
    title: s.title,
    preview: s.preview,
    total: s.total,
  }));
}
