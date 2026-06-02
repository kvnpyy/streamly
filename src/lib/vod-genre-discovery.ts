import { looksAdult, parsePositiveRouteId, safeStr } from "@/lib/utils";
import type { Category } from "@/lib/xtream-types";

export type VodShelfItem = {
  id: number;
  href: string;
  poster?: string;
  title: string;
  subtitle?: string;
  rating?: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
};

/** Provider category names that look like genres (ordered for Netflix-style rails). */
const GENRE_NAME_PRIORITY: RegExp[] = [
  /^comedy\b/i,
  /\bcomedy\b/i,
  /^horror\b/i,
  /\bhorror\b/i,
  /^action\b/i,
  /\baction\b/i,
  /^drama\b/i,
  /\bdrama\b/i,
  /^thriller\b/i,
  /\bthriller\b/i,
  /^romance\b/i,
  /\bromance\b/i,
  /sci[-\s]?fi|science fiction/i,
  /^fantasy\b/i,
  /\bfantasy\b/i,
  /^documentary\b/i,
  /\bdocumentary\b/i,
  /animation|animated|anime|cartoon/i,
  /^family\b/i,
  /\bfamily\b/i,
  /^kids?\b/i,
  /\bkids?\b/i,
  /^crime\b/i,
  /\bcrime\b/i,
  /^adventure\b/i,
  /\badventure\b/i,
  /^war\b/i,
  /\bwar\b/i,
  /^western\b/i,
  /\bmystery\b/i,
  /^music\b/i,
  /^sport/i,
];

const MIN_ITEMS_PER_SHELF = 6;
const DEFAULT_MAX_SHELVES = 10;
const DEFAULT_ITEMS_PER_SHELF = 20;

export type VodCatalogKind = "movie" | "series";

export type VodStreamForShelf = {
  category_id: string;
  name: string;
  rating?: string;
  year?: string;
  stream_icon?: string;
  cover?: string;
  is_adult?: 0 | 1 | string;
  stream_id?: number;
  series_id?: number;
};

function genrePriorityScore(name: unknown): number {
  const n = safeStr(name).trim();
  for (let i = 0; i < GENRE_NAME_PRIORITY.length; i++) {
    if (GENRE_NAME_PRIORITY[i]!.test(n)) return GENRE_NAME_PRIORITY.length - i;
  }
  return 0;
}

function streamRouteId(
  kind: VodCatalogKind,
  s: VodStreamForShelf
): number | null {
  if (kind === "movie") return parsePositiveRouteId(s.stream_id);
  return parsePositiveRouteId(s.series_id);
}

function posterFor(kind: VodCatalogKind, s: VodStreamForShelf): string | undefined {
  return kind === "movie" ? s.stream_icon : s.cover;
}

/** Pick provider categories that work as browse-by-genre shelves. */
export function pickGenreCategories(
  categories: Category[],
  countById: Record<string, number>,
  opts?: { max?: number; hideAdult?: boolean }
): Category[] {
  const max = opts?.max ?? DEFAULT_MAX_SHELVES;
  const hideAdult = opts?.hideAdult ?? false;

  const eligible = categories.filter((c) => {
    const id = String(c.category_id);
    const count = countById[id] ?? 0;
    if (count < MIN_ITEMS_PER_SHELF) return false;
    if (hideAdult && looksAdult({ category_name: c.category_name })) return false;
    const name = safeStr(c.category_name).trim();
    if (!name || name.length < 2) return false;
    if (/^all$|^other$|^uncategor/i.test(name)) return false;
    return true;
  });

  return eligible
    .slice()
    .sort((a, b) => {
      const pa = genrePriorityScore(a.category_name);
      const pb = genrePriorityScore(b.category_name);
      if (pb !== pa) return pb - pa;
      const ca = countById[String(a.category_id)] ?? 0;
      const cb = countById[String(b.category_id)] ?? 0;
      return cb - ca;
    })
    .slice(0, max);
}

export function buildProviderGenreShelves(opts: {
  kind: VodCatalogKind;
  categories: Category[];
  countById: Record<string, number>;
  streams: VodStreamForShelf[];
  allowedCatIds: Set<string>;
  hideAdult: boolean;
  parentalUnlocked: boolean;
  isFavorite: (kind: VodCatalogKind, id: number) => boolean;
  toggleFavorite: (f: {
    kind: VodCatalogKind;
    id: number;
    name: string;
    icon?: string;
  }) => void;
  maxShelves?: number;
  itemsPerShelf?: number;
}): Array<{ categoryId: string; title: string; items: VodShelfItem[] }> {
  const hideAdult = opts.hideAdult && !opts.parentalUnlocked;
  const itemsPerShelf = opts.itemsPerShelf ?? DEFAULT_ITEMS_PER_SHELF;
  const picked = pickGenreCategories(opts.categories, opts.countById, {
    max: opts.maxShelves,
    hideAdult,
  });

  const byCat = new Map<string, VodStreamForShelf[]>();
  for (const s of opts.streams) {
    const cid = String(s.category_id);
    if (hideAdult) {
      if (!opts.allowedCatIds.has(cid)) continue;
      if (looksAdult({ name: s.name, is_adult: s.is_adult })) continue;
    }
    const id = streamRouteId(opts.kind, s);
    if (id == null) continue;
    const list = byCat.get(cid);
    if (list) list.push(s);
    else byCat.set(cid, [s]);
  }

  const shelves: Array<{
    categoryId: string;
    title: string;
    items: VodShelfItem[];
  }> = [];

  for (const cat of picked) {
    const cid = String(cat.category_id);
    const list = byCat.get(cid);
    if (!list || list.length < MIN_ITEMS_PER_SHELF) continue;

    const items = list
      .slice()
      .sort(
        (a, b) =>
          (parseFloat(b.rating || "0") || 0) - (parseFloat(a.rating || "0") || 0)
      )
      .slice(0, itemsPerShelf)
      .map((s) => {
        const id = streamRouteId(opts.kind, s)!;
        const poster = posterFor(opts.kind, s);
        const href =
          opts.kind === "movie" ? `/app/movies/${id}` : `/app/series/${id}`;
        return {
          id,
          href,
          poster,
          title: s.name,
          subtitle: s.year,
          rating: s.rating,
          isFavorite: opts.isFavorite(opts.kind, id),
          onToggleFavorite: () =>
            opts.toggleFavorite({
              kind: opts.kind,
              id,
              name: s.name,
              icon: poster,
            }),
        };
      });

    if (items.length >= MIN_ITEMS_PER_SHELF) {
      shelves.push({
        categoryId: cid,
        title: safeStr(cat.category_name).trim(),
        items,
      });
    }
  }

  return shelves;
}
