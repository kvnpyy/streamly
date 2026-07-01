"use client";

import type { MediaShelfItem } from "@/components/MediaShelf";
import { filterDiscoveryShelfItems } from "@/lib/vod-discovery-shelf-filter";
import type {
  GenreDiscoveryShelfDto,
  VodDiscoveryShelfItemDto,
  VodDiscoveryShelvesPayload,
} from "@/lib/vod-discovery-shelves-types";
import { useMemo } from "react";

export type FilteredGenreDiscoveryShelf = GenreDiscoveryShelfDto & {
  items: MediaShelfItem[];
};

export function useFilteredVodDiscoveryShelves<T extends MediaShelfItem>(
  data: VodDiscoveryShelvesPayload | undefined,
  filter: Parameters<typeof filterDiscoveryShelfItems>[1],
  attach: (items: VodDiscoveryShelfItemDto[]) => T[]
) {
  return useMemo(() => {
    const topRated = attach(
      filterDiscoveryShelfItems(data?.topRated ?? [], filter)
    );
    const newlyAdded = attach(
      filterDiscoveryShelfItems(data?.newlyAdded ?? [], filter)
    );
    const forYou = attach(filterDiscoveryShelfItems(data?.forYou ?? [], filter));
    const trending = attach(
      filterDiscoveryShelfItems(data?.trending ?? [], filter)
    );
    const genreShelves: FilteredGenreDiscoveryShelf[] = (
      data?.genreShelves ?? []
    ).map((shelf) => ({
      ...shelf,
      items: attach(
        filterDiscoveryShelfItems(shelf.items, filter, {
          shelfCategoryId: shelf.categoryId,
        })
      ),
    }));

    return { topRated, newlyAdded, forYou, trending, genreShelves };
  }, [data, filter, attach]);
}
