import {
  buildIdsByCategory,
  countByCategoryFromIndex,
} from "@/lib/vod-catalog-index";
import type { Category, SeriesItem, VodStream } from "@/lib/xtream-types";

export type VodCatalogBundle = {
  categories: Category[];
  streams: VodStream[];
  countByCategoryId: Record<string, number>;
  idsByCategory: Record<string, number[]>;
};

export type SeriesCatalogBundle = {
  categories: Category[];
  streams: SeriesItem[];
  countByCategoryId: Record<string, number>;
  idsByCategory: Record<string, number[]>;
};

export function bundleVodWithIndex(
  categories: Category[],
  streams: VodStream[]
): VodCatalogBundle {
  const idsByCategory = buildIdsByCategory(
    streams,
    (s) => String(s.category_id),
    (s) => s.stream_id
  );
  return {
    categories,
    streams,
    countByCategoryId: countByCategoryFromIndex(idsByCategory),
    idsByCategory,
  };
}

export function bundleSeriesWithIndex(
  categories: Category[],
  streams: SeriesItem[]
): SeriesCatalogBundle {
  const idsByCategory = buildIdsByCategory(
    streams,
    (s) => String(s.category_id),
    (s) => s.series_id
  );
  return {
    categories,
    streams,
    countByCategoryId: countByCategoryFromIndex(idsByCategory),
    idsByCategory,
  };
}
