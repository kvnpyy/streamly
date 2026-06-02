/** Category → item id index for fast VOD browse (movies + series). */

export function buildIdsByCategory<T>(
  items: T[],
  getCategoryId: (item: T) => string,
  getItemId: (item: T) => number
): Record<string, number[]> {
  const map: Record<string, number[]> = {};
  for (const item of items) {
    const cid = getCategoryId(item);
    const id = getItemId(item);
    const bucket = map[cid];
    if (bucket) bucket.push(id);
    else map[cid] = [id];
  }
  return map;
}

export function countByCategoryFromIndex(
  idsByCategory: Record<string, number[]>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [cid, ids] of Object.entries(idsByCategory)) {
    counts[cid] = ids.length;
  }
  return counts;
}

export function buildItemByIdMap<T>(
  items: T[],
  getItemId: (item: T) => number
): Map<number, T> {
  const map = new Map<number, T>();
  for (const item of items) map.set(getItemId(item), item);
  return map;
}

/** O(category size) when index + byId are present. */
export function pickItemsForCategory<T>(
  all: T[],
  categoryId: string | "all",
  idsByCategory?: Record<string, number[]>,
  byId?: Map<number, T>
): T[] {
  if (categoryId === "all") return all;
  const cid = String(categoryId);
  if (idsByCategory && byId) {
    const ids = idsByCategory[cid];
    if (!ids?.length) return [];
    const out: T[] = [];
    for (let i = 0; i < ids.length; i++) {
      const row = byId.get(ids[i]!);
      if (row) out.push(row);
    }
    return out;
  }
  return all;
}
