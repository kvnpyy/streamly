import type { Category } from "@/lib/xtream-types";
import type { SeriesCatalogBundle, VodCatalogBundle } from "@/lib/vod-catalog-bundle";

/** VOD browse metadata without shipping movie rows to the browser. */
export type SlimVodCatalog = {
  categories: Category[];
  countByCategoryId: Record<string, number>;
};

export type SlimSeriesCatalog = SlimVodCatalog;

type SlimCatalogSource = {
  categories: Category[];
  streams?: Array<{ category_id: string | number }>;
  countByCategoryId?: Record<string, number>;
  idsByCategory?: Record<string, number[]>;
};

function toSlimCatalog(bundle: SlimCatalogSource): SlimVodCatalog {
  const counts = bundle.countByCategoryId ?? {};
  if (Object.keys(counts).length > 0) {
    return {
      categories: bundle.categories ?? [],
      countByCategoryId: counts,
    };
  }
  const fromIndex = bundle.idsByCategory;
  if (fromIndex && Object.keys(fromIndex).length > 0) {
    const countByCategoryId: Record<string, number> = {};
    for (const [cid, ids] of Object.entries(fromIndex)) {
      countByCategoryId[cid] = ids?.length ?? 0;
    }
    return { categories: bundle.categories ?? [], countByCategoryId };
  }
  const countByCategoryId: Record<string, number> = {};
  for (const s of bundle.streams ?? []) {
    const cid = String(s.category_id);
    countByCategoryId[cid] = (countByCategoryId[cid] ?? 0) + 1;
  }
  return {
    categories: bundle.categories ?? [],
    countByCategoryId,
  };
}

export function toSlimVodCatalog(bundle: VodCatalogBundle): SlimVodCatalog {
  return toSlimCatalog(bundle);
}

export function toSlimSeriesCatalog(bundle: SeriesCatalogBundle): SlimSeriesCatalog {
  return toSlimCatalog(bundle);
}

export function slimVodCatalogBody(bundle: VodCatalogBundle): SlimVodCatalog {
  return toSlimVodCatalog(bundle);
}

export function slimSeriesCatalogBody(bundle: SeriesCatalogBundle): SlimSeriesCatalog {
  return toSlimSeriesCatalog(bundle);
}
