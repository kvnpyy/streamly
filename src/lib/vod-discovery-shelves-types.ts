/** Serializable shelf row — built on the VPS, enriched client-side with favorites/play. */
export type VodDiscoveryShelfItemDto = {
  id: number;
  href: string;
  poster?: string;
  title: string;
  subtitle?: string;
  rating?: string;
  container_extension?: string;
};

export type GenreDiscoveryShelfDto = {
  categoryId: string;
  title: string;
  items: VodDiscoveryShelfItemDto[];
};

export type VodDiscoveryShelvesPayload = {
  topRated: VodDiscoveryShelfItemDto[];
  newlyAdded: VodDiscoveryShelfItemDto[];
  forYou: VodDiscoveryShelfItemDto[];
  trending: VodDiscoveryShelfItemDto[];
  genreShelves: GenreDiscoveryShelfDto[];
  trendingSynced: boolean;
};

export type SeriesDiscoveryShelvesPayload = {
  topRated: VodDiscoveryShelfItemDto[];
  newlyAdded: VodDiscoveryShelfItemDto[];
  forYou: VodDiscoveryShelfItemDto[];
  trending: VodDiscoveryShelfItemDto[];
  genreShelves: GenreDiscoveryShelfDto[];
  trendingSynced: boolean;
};
