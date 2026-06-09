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

  const catRegion = getCategoryRegion(category.category_name);
  const catId = String(category.category_id);

  const catName = category.category_name;
  const categoryLocked = catRegion !== null && catRegion === region;

  if (region === "All" || categoryLocked) {
    const preview: LiveStream[] = [];
    for (let i = 0; i < streamIds.length && preview.length < previewLimit; i++) {
      const s = byId.get(streamIds[i]!);
      if (s) preview.push(s);
    }
    if (preview.length === 0) return null;
    return {
      id: catId,
      title: catName,
      preview,
      total: streamIds.length,
    };
  }

  const probeCap = Math.min(streamIds.length, 10);
  let probeSawStream = false;
  let probeSawMatch = false;
  for (let i = 0; i < probeCap; i++) {
    const s = byId.get(streamIds[i]!);
    if (!s) continue;
    probeSawStream = true;
    if (streamMatchesRegion(s.name, catName, region)) {
      probeSawMatch = true;
      break;
    }
  }
  if (probeSawStream && !probeSawMatch) return null;

  const preview: LiveStream[] = [];
  let total = 0;
  const scanCap = Math.min(streamIds.length, previewLimit * 4);

  let extraCountScans = 0;
  for (let i = 0; i < scanCap; i++) {
    const s = byId.get(streamIds[i]!);
    if (!s) continue;
    if (!streamMatchesRegion(s.name, catName, region)) continue;
    total++;
    if (preview.length < previewLimit) {
      preview.push(s);
    } else {
      extraCountScans++;
      if (extraCountScans > 8) break;
    }
  }

  if (preview.length === 0) {
    return null;
  }

  let finalTotal = total;
  if (scanCap < streamIds.length && total > 0) {
    finalTotal = Math.max(
      total,
      Math.round((total / scanCap) * streamIds.length)
    );
  } else if (scanCap < streamIds.length) {
    finalTotal = streamIds.length;
  }

  return {
    id: catId,
    title: category.category_name,
    preview,
    total: finalTotal,
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
