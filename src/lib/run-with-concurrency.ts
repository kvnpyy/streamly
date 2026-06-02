/**
 * Run async tasks with a fixed concurrency cap (sequential batches).
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const cap = Math.max(1, concurrency);
  for (let i = 0; i < items.length; i += cap) {
    const slice = items.slice(i, i + cap);
    await Promise.all(slice.map((item, j) => worker(item, i + j)));
  }
}
