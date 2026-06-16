import { collectVodLanguages } from "@/lib/vod-language";
import type { Category } from "@/lib/xtream-types";
import type { SeriesCatalogBundle, VodCatalogBundle } from "@/lib/vod-catalog-bundle";

/** VOD browse metadata without shipping movie rows to the browser. */
export type SlimVodCatalog = {
  categories: Category[];
  countByCategoryId: Record<string, number>;
  /** Language codes detected from title/category prefixes (EN, FR, …). */
  languages: string[];
};

export type SlimSeriesCatalog = SlimVodCatalog;

type SlimCatalogSource = {
  categories: Category[];
  streams?: Array<{ category_id: string | number; name: string }>;
  countByCategoryId?: Record<string, number>;
  idsByCategory?: Record<string, number[]>;
};

function toSlimCatalog(bundle: SlimCatalogSource): SlimVodCatalog {
  const categories = bundle.categories ?? [];
  const presetLanguages = Array.isArray(
    (bundle as Partial<SlimVodCatalog>).languages
  )
    ? (bundle as SlimVodCatalog).languages
    : undefined;
  const streams = bundle.streams ?? [];
  const languages =
    presetLanguages ??
    (streams.length > 0
      ? collectVodLanguages(streams, categories)
      : collectVodLanguages([], categories));
  const counts = bundle.countByCategoryId ?? {};
  if (Object.keys(counts).length > 0) {
    return {
      categories,
      countByCategoryId: counts,
      languages,
    };
  }
  const fromIndex = bundle.idsByCategory;
  if (fromIndex && Object.keys(fromIndex).length > 0) {
    const countByCategoryId: Record<string, number> = {};
    for (const [cid, ids] of Object.entries(fromIndex)) {
      countByCategoryId[cid] = ids?.length ?? 0;
    }
    return { categories, countByCategoryId, languages };
  }
  const countByCategoryId: Record<string, number> = {};
  for (const s of bundle.streams ?? []) {
    const cid = String(s.category_id);
    countByCategoryId[cid] = (countByCategoryId[cid] ?? 0) + 1;
  }
  return {
    categories,
    countByCategoryId,
    languages,
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

/** Client parse for slim catalog API responses — keep server-computed languages. */
export function parseSlimCatalogResponse(
  data: Partial<SlimVodCatalog & VodCatalogBundle>
): SlimVodCatalog {
  if (data.streams?.length) {
    return toSlimCatalog(data as VodCatalogBundle);
  }
  return {
    categories: data.categories ?? [],
    countByCategoryId: data.countByCategoryId ?? {},
    languages: data.languages ?? collectVodLanguages([], data.categories ?? []),
  };
}
