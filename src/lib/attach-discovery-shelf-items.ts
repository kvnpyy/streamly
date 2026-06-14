import type { MediaShelfItem } from "@/components/MediaShelf";
import type { VodDiscoveryShelfItemDto } from "@/lib/vod-discovery-shelves-types";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";

export function attachMovieDiscoveryShelfItems(
  items: VodDiscoveryShelfItemDto[],
  opts: {
    isFavorite: (id: number) => boolean;
    toggleFavoriteMovie: (m: VodStream, mid: number) => void;
    playMovie: (
      m: Pick<VodStream, "stream_id" | "name"> &
        Partial<Pick<VodStream, "stream_icon" | "year" | "rating" | "container_extension">>
    ) => void;
  }
): MediaShelfItem[] {
  return items.map((dto) => {
    const movie = {
      stream_id: dto.id,
      name: dto.title,
      stream_icon: dto.poster ?? "",
      year: dto.subtitle,
      rating: dto.rating,
      container_extension: dto.container_extension || "mp4",
      stream_type: "movie" as const,
      category_id: "",
      added: "",
      num: 0,
    } satisfies Pick<
      VodStream,
      | "stream_id"
      | "name"
      | "stream_icon"
      | "year"
      | "rating"
      | "container_extension"
      | "stream_type"
      | "category_id"
      | "added"
      | "num"
    >;
    return {
      id: dto.id,
      href: dto.href,
      poster: dto.poster,
      title: dto.title,
      subtitle: dto.subtitle,
      rating: dto.rating,
      isFavorite: opts.isFavorite(dto.id),
      onToggleFavorite: () => opts.toggleFavoriteMovie(movie as VodStream, dto.id),
      onClick: () => opts.playMovie(movie),
      detailHref: dto.href,
    };
  });
}

export function attachSeriesDiscoveryShelfItems(
  items: VodDiscoveryShelfItemDto[],
  opts: {
    isFavorite: (id: number) => boolean;
    toggleFavoriteSeries: (s: SeriesItem, sid: number) => void;
  }
): MediaShelfItem[] {
  return items.map((dto) => {
    const series = {
      series_id: dto.id,
      name: dto.title,
      cover: dto.poster ?? "",
      year: dto.subtitle,
      rating: dto.rating,
      category_id: "",
      last_modified: "",
      num: 0,
    } satisfies Pick<
      SeriesItem,
      "series_id" | "name" | "cover" | "year" | "rating" | "category_id" | "last_modified" | "num"
    >;
    return {
      id: dto.id,
      href: dto.href,
      poster: dto.poster,
      title: dto.title,
      subtitle: dto.subtitle,
      rating: dto.rating,
      isFavorite: opts.isFavorite(dto.id),
      onToggleFavorite: () => opts.toggleFavoriteSeries(series as SeriesItem, dto.id),
    };
  });
}
