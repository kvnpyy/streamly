import {
  categoryMatchesRegion,
  sortLiveCategoriesForBrowse,
  type TvRegion,
} from "@/lib/geo-continent";
import type { Category } from "@/lib/xtream-types";

/** Categories shown per screen on TV before "Show more". */
export const TV_SIMPLE_CATEGORY_BATCH = 18;

/** Live channels loaded per batch inside a category. */
export const TV_SIMPLE_CHANNEL_BATCH = 24;

/** Movies/series tiles per screen before load more. */
export const TV_SIMPLE_VOD_BATCH = 36;

export function filterLiveCategoriesForTvRegion(
  categories: Category[],
  region: TvRegion
): Category[] {
  const matched = categories.filter((c) =>
    categoryMatchesRegion(c.category_name, region)
  );
  return sortLiveCategoriesForBrowse(matched, region);
}

export function normalizeCredsKey(server: string, username: string): string {
  return `${server.trim().toLowerCase().replace(/\/+$/, "")}\x1f${username.trim().toLowerCase()}`;
}
