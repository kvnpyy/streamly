import type { LiveShelfMeta } from "@/lib/live-category-shelf";

export type LiveShelfRowMemoProps = {
  shelf: LiveShelfMeta;
  maxPerShelf: number;
  activeStreamId?: number;
  nowPlayingMap: Map<number, string>;
};

/** Re-render a shelf row only when its preview tiles or their EPG lines change. */
export function liveShelfRowPropsAreEqual(
  prev: LiveShelfRowMemoProps,
  next: LiveShelfRowMemoProps
): boolean {
  if (prev.shelf.id !== next.shelf.id) return false;
  if (prev.maxPerShelf !== next.maxPerShelf) return false;
  if (prev.activeStreamId !== next.activeStreamId) return false;
  if (prev.shelf.preview !== next.shelf.preview) return false;
  if (prev.shelf.title !== next.shelf.title) return false;
  if (prev.shelf.total !== next.shelf.total) return false;

  const limit = Math.min(prev.maxPerShelf, prev.shelf.preview.length);
  for (let i = 0; i < limit; i++) {
    const id = prev.shelf.preview[i]!.stream_id;
    if (prev.nowPlayingMap.get(id) !== next.nowPlayingMap.get(id)) {
      return false;
    }
  }
  return true;
}
