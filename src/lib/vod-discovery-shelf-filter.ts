import { vodItemMatchesLanguage } from "@/lib/vod-language";
import type { MediaShelfItem } from "@/components/MediaShelf";
import type { VodDiscoveryShelfItemDto } from "@/lib/vod-discovery-shelves-types";
import { safeLower } from "@/lib/utils";

export type VodDiscoveryShelfFilter = {
  categoryId?: string | "all";
  q?: string;
  lang?: string;
  categoryNameById?: Map<string, string>;
};

function matchesSearch(title: string, q?: string): boolean {
  const needle = safeLower(q?.trim() ?? "");
  if (!needle) return true;
  return safeLower(title).includes(needle);
}

function matchesCategory(
  item: VodDiscoveryShelfItemDto,
  categoryId: string | "all" | undefined,
  shelfCategoryId?: string
): boolean {
  if (!categoryId || categoryId === "all") return true;
  const itemCategoryId = item.categoryId ?? shelfCategoryId;
  if (!itemCategoryId) return true;
  return String(itemCategoryId) === String(categoryId);
}

function matchesLanguage(
  item: VodDiscoveryShelfItemDto,
  lang: string | undefined,
  categoryNameById?: Map<string, string>
): boolean {
  if (!lang) return true;
  const categoryName = item.categoryId
    ? categoryNameById?.get(String(item.categoryId))
    : undefined;
  return vodItemMatchesLanguage(item.title, lang, categoryName);
}

/** Keep shelf layout stable — only drop rows that fail active browse filters. */
export function filterDiscoveryShelfItems(
  items: VodDiscoveryShelfItemDto[],
  filter: VodDiscoveryShelfFilter,
  opts?: { shelfCategoryId?: string }
): VodDiscoveryShelfItemDto[] {
  const { categoryId, q, lang, categoryNameById } = filter;
  const shelfCategoryId = opts?.shelfCategoryId;
  const hasFilter =
    (categoryId && categoryId !== "all") ||
    Boolean(q?.trim()) ||
    Boolean(lang);

  if (!hasFilter) return items;

  return items.filter(
    (item) =>
      matchesCategory(item, categoryId, shelfCategoryId) &&
      matchesSearch(item.title, q) &&
      matchesLanguage(item, lang, categoryNameById)
  );
}

function mediaShelfToDto(item: MediaShelfItem): VodDiscoveryShelfItemDto {
  return {
    id: item.id,
    href: item.href,
    title: item.title,
    poster: item.poster,
    subtitle: item.subtitle,
    rating: item.rating,
    categoryId: item.categoryId,
  };
}

export function filterMediaShelfItems(
  items: MediaShelfItem[],
  filter: VodDiscoveryShelfFilter
): MediaShelfItem[] {
  const filteredIds = new Set(
    filterDiscoveryShelfItems(
      items.map(mediaShelfToDto),
      filter
    ).map((item) => item.id)
  );
  return items.filter((item) => filteredIds.has(item.id));
}
