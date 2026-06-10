import {
  categoryMatchesRegion,
  getCategoryRegion,
  streamMatchesRegion,
  type TvRegion,
} from "@/lib/geo-continent";
import type { Category, LiveStream } from "@/lib/xtream-types";

export type LiveShelfMeta = {
  id: string;
  title: string;
  /** Channels to render in the horizontal shelf (already region-filtered). */
  preview: LiveStream[];
  /** Total channels in category after region filter (may be approximate for huge lists). */
  total: number;
};

/** Skip shelf work when the category title already conflicts with the region filter. */
export function categoryPassesRegionGate(
  categoryName: string,
  region: TvRegion
): boolean {
  return categoryMatchesRegion(categoryName, region);
}

/**
 * Collect shelf preview tiles — scans the full category index when needed so
 * regional matches deep in large mixed lists are not missed (old cap was ~42).
 */
export function collectRegionalShelfPreview(
  streamIds: number[],
  resolveStream: (id: number) => LiveStream | undefined,
  categoryName: string,
  region: TvRegion,
  previewLimit: number
): LiveStream[] {
  if (!streamIds.length || previewLimit < 1) return [];

  if (region === "All") {
    const out: LiveStream[] = [];
    for (const id of streamIds) {
      if (out.length >= previewLimit) break;
      const s = resolveStream(id);
      if (s) out.push(s);
    }
    return out;
  }

  const catRegion = getCategoryRegion(categoryName);
  if (catRegion !== null && catRegion === region) {
    const out: LiveStream[] = [];
    for (const id of streamIds) {
      if (out.length >= previewLimit) break;
      const s = resolveStream(id);
      if (s) out.push(s);
    }
    return out;
  }

  const out: LiveStream[] = [];
  for (const id of streamIds) {
    if (out.length >= previewLimit) break;
    const s = resolveStream(id);
    if (!s) continue;
    if (streamMatchesRegion(s.name, categoryName, region)) out.push(s);
  }
  return out;
}

/**
 * Build shelf meta from server `streamIdsByCategory` + stream map — never materializes
 * full per-category channel arrays (avoids O(total streams) RAM + CPU).
 */
export function buildLiveShelfMetaFromIndex(
  category: Category,
  streamIds: number[] | undefined,
  byId: Map<number, LiveStream>,
  region: TvRegion,
  previewLimit: number
): LiveShelfMeta | null {
  if (!streamIds?.length) return null;
  if (!categoryPassesRegionGate(category.category_name, region)) return null;

  const catId = String(category.category_id);
  const catName = category.category_name;
  const catRegion = getCategoryRegion(catName);
  const categoryLocked = catRegion !== null && catRegion === region;

  const preview = collectRegionalShelfPreview(
    streamIds,
    (id) => byId.get(id),
    catName,
    region,
    previewLimit
  );
  if (preview.length === 0) return null;

  if (region === "All" || categoryLocked) {
    return {
      id: catId,
      title: catName,
      preview,
      total: streamIds.length,
    };
  }

  let total = 0;
  for (const id of streamIds) {
    const s = byId.get(id);
    if (!s) continue;
    if (streamMatchesRegion(s.name, catName, region)) total++;
  }

  return {
    id: catId,
    title: catName,
    preview,
    total: total > 0 ? total : preview.length,
  };
}

/**
 * Build a shelf preview without scanning tens of thousands of channel names when
 * we only need a handful of tiles for the row.
 */
export function buildLiveShelfMeta(
  category: Category,
  allChannels: LiveStream[] | undefined,
  region: TvRegion,
  previewLimit: number
): LiveShelfMeta | null {
  if (!allChannels?.length) return null;
  if (!categoryPassesRegionGate(category.category_name, region)) return null;

  const catRegion = getCategoryRegion(category.category_name);

  const catName = category.category_name;
  const categoryLocked = catRegion !== null && catRegion === region;

  if (region === "All" || categoryLocked) {
    const total = allChannels.length;
    return {
      id: String(category.category_id),
      title: catName,
      preview: allChannels.slice(0, previewLimit),
      total,
    };
  }

  const preview: LiveStream[] = [];
  let total = 0;
  const scanCap = Math.min(allChannels.length, previewLimit * 4);

  for (let i = 0; i < scanCap; i++) {
    const ch = allChannels[i]!;
    if (!streamMatchesRegion(ch.name, catName, region)) continue;
    total++;
    if (preview.length < previewLimit) preview.push(ch);
  }

  if (preview.length === 0) {
    return null;
  }

  if (scanCap < allChannels.length && total > 0) {
    total = Math.max(total, Math.round((total / scanCap) * allChannels.length));
  } else if (scanCap < allChannels.length) {
    total = allChannels.length;
  }

  return {
    id: String(category.category_id),
    title: category.category_name,
    preview,
    total,
  };
}

/** Full channel list for category overlay / see-all (same rules as shelf meta). */
export function filterStreamsForTvRegion(
  channels: LiveStream[],
  region: TvRegion,
  categoryName: string
): LiveStream[] {
  if (!channels.length) return channels;
  if (region === "All") return channels;
  const catRegion = getCategoryRegion(categoryName);
  if (catRegion !== null) {
    return catRegion === region ? channels : [];
  }
  const out: LiveStream[] = [];
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i]!;
    if (streamMatchesRegion(ch.name, categoryName, region)) out.push(ch);
  }
  return out;
}
