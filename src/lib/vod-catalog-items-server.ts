import { safeLower, safeStr } from "@/lib/utils";
import {
  materializeSeriesIds,
  materializeVodStreamIds,
} from "@/lib/vod-catalog-stream-map";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";
import type { SeriesCatalogBundle, VodCatalogBundle } from "@/lib/vod-catalog-bundle";

export type VodCatalogSort = "added" | "rating" | "name";

export type ListVodItemsOpts = {
  categoryId?: string | "all";
  offset?: number;
  limit?: number;
  sort?: VodCatalogSort;
  q?: string;
  streamIds?: number[];
};

export type VodItemsPage = {
  items: VodStream[];
  total: number;
  offset: number;
  limit: number;
};

export type SeriesItemsPage = {
  items: SeriesItem[];
  total: number;
  offset: number;
  limit: number;
};

export const VOD_ITEMS_DEFAULT_LIMIT = 120;
export const VOD_ITEMS_MAX_LIMIT = 600;

function clampLimit(limit: number | undefined): number {
  const n = Number.isFinite(limit) ? Number(limit) : VOD_ITEMS_DEFAULT_LIMIT;
  return Math.min(VOD_ITEMS_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function clampOffset(offset: number | undefined): number {
  const n = Number.isFinite(offset) ? Number(offset) : 0;
  return Math.max(0, Math.floor(n));
}

function idsForCategory(
  index: Record<string, number[]>,
  categoryId: string | "all"
): number[] {
  if (categoryId === "all") {
    const out: number[] = [];
    for (const ids of Object.values(index)) {
      if (!ids?.length) continue;
      for (let i = 0; i < ids.length; i++) out.push(ids[i]!);
    }
    return out;
  }
  return index[String(categoryId)] ?? [];
}

function sortVodStreams(streams: VodStream[], sort: VodCatalogSort): VodStream[] {
  if (sort === "added" || streams.length < 2) return streams;
  const copy = streams.slice();
  if (sort === "rating") {
    copy.sort(
      (a, b) =>
        (parseFloat(b.rating || "0") || 0) - (parseFloat(a.rating || "0") || 0)
    );
    return copy;
  }
  copy.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name)));
  return copy;
}

function sortSeriesItems(streams: SeriesItem[], sort: VodCatalogSort): SeriesItem[] {
  if (sort === "added" || streams.length < 2) return streams;
  const copy = streams.slice();
  if (sort === "rating") {
    copy.sort(
      (a, b) =>
        (parseFloat(b.rating || "0") || 0) - (parseFloat(a.rating || "0") || 0)
    );
    return copy;
  }
  copy.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name)));
  return copy;
}

function filterVodByQuery(streams: VodStream[], q: string): VodStream[] {
  const needle = safeLower(q.trim());
  if (!needle) return streams;
  return streams.filter((s) => safeLower(s.name).includes(needle));
}

function filterSeriesByQuery(streams: SeriesItem[], q: string): SeriesItem[] {
  const needle = safeLower(q.trim());
  if (!needle) return streams;
  return streams.filter((s) => safeLower(s.name).includes(needle));
}

export function listVodItemsFromBundle(
  bundle: VodCatalogBundle,
  streamById: Map<number, VodStream>,
  opts: ListVodItemsOpts
): VodItemsPage {
  const offset = clampOffset(opts.offset);
  const limit = clampLimit(opts.limit);
  const sort = opts.sort ?? "added";
  const categoryId = opts.categoryId ?? "all";

  let streams: VodStream[];
  if (opts.streamIds?.length) {
    streams = materializeVodStreamIds(
      streamById,
      opts.streamIds,
      opts.streamIds.length
    );
  } else {
    const index = bundle.idsByCategory ?? {};
    const ids = idsForCategory(index, categoryId);
    if (!Object.keys(index).length && bundle.streams?.length) {
      streams = bundle.streams.filter((s) => {
        if (categoryId === "all") return true;
        return String(s.category_id) === String(categoryId);
      });
    } else {
      streams = materializeVodStreamIds(streamById, ids, ids.length);
    }
  }

  streams = filterVodByQuery(streams, opts.q ?? "");
  if (sort !== "added") streams = sortVodStreams(streams, sort);

  const total = streams.length;
  const items = streams.slice(offset, offset + limit);
  return { items, total, offset, limit };
}

export function listSeriesItemsFromBundle(
  bundle: SeriesCatalogBundle,
  seriesById: Map<number, SeriesItem>,
  opts: ListVodItemsOpts
): SeriesItemsPage {
  const offset = clampOffset(opts.offset);
  const limit = clampLimit(opts.limit);
  const sort = opts.sort ?? "added";
  const categoryId = opts.categoryId ?? "all";

  let items: SeriesItem[];
  if (opts.streamIds?.length) {
    items = materializeSeriesIds(
      seriesById,
      opts.streamIds,
      opts.streamIds.length
    );
  } else {
    const index = bundle.idsByCategory ?? {};
    const ids = idsForCategory(index, categoryId);
    if (!Object.keys(index).length && bundle.streams?.length) {
      items = bundle.streams.filter((s) => {
        if (categoryId === "all") return true;
        return String(s.category_id) === String(categoryId);
      });
    } else {
      items = materializeSeriesIds(seriesById, ids, ids.length);
    }
  }

  items = filterSeriesByQuery(items, opts.q ?? "");
  if (sort !== "added") items = sortSeriesItems(items, sort);

  const total = items.length;
  const page = items.slice(offset, offset + limit);
  return { items: page, total, offset, limit };
}
