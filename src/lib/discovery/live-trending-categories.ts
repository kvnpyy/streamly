import type { Category } from "@/lib/xtream-types";

/** Prefer sports / entertainment categories when sampling EPG for Trending on TV. */
export function sortCategoriesForTrendingScan(categories: Category[]): Category[] {
  const rank = (name: string): number => {
    const n = name.toLowerCase();
    if (/\b(sport|nba|nfl|mlb|nhl|espn|ppv|fight|ufc|boxing)\b/.test(n)) {
      return 0;
    }
    if (/\b(entertain|premium|general|culture|movie|cinema)\b/.test(n)) {
      return 1;
    }
    if (/\b(news|kids|religion|adult|xxx)\b/.test(n)) return 3;
    return 2;
  };
  return [...categories].sort(
    (a, b) => rank(a.category_name) - rank(b.category_name)
  );
}
