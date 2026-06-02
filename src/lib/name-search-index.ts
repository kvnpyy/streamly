import { safeLower } from "@/lib/utils";

export type NameSearchIndex<T> = {
  items: T[];
  /** Parallel lowercase names for fast `.includes` without repeated `safeLower`. */
  nameLower: string[];
};

export function buildNameSearchIndex<T>(
  items: T[],
  getName: (item: T) => string
): NameSearchIndex<T> {
  const nameLower = new Array<string>(items.length);
  for (let i = 0; i < items.length; i++) {
    nameLower[i] = safeLower(getName(items[i]!));
  }
  return { items, nameLower };
}

export function filterByNameQuery<T>(
  index: NameSearchIndex<T>,
  queryLower: string
): T[] {
  if (!queryLower) return index.items;
  const out: T[] = [];
  for (let i = 0; i < index.items.length; i++) {
    if (index.nameLower[i]!.includes(queryLower)) {
      out.push(index.items[i]!);
    }
  }
  return out;
}
