"use client";

import { MediaShelf } from "@/components/MediaShelf";
import { useCatalogPlay } from "@/hooks/use-catalog-play";
import type { SimilarTitle } from "@/lib/similar-titles";
import { usePrefs } from "@/store/preferences";

type SimilarTitlesShelfProps = {
  titles: SimilarTitle[];
  kind: "movie" | "series";
};

export function SimilarTitlesShelf({ titles, kind }: SimilarTitlesShelfProps) {
  const { isFavorite, toggleFavorite } = usePrefs();
  const { playMovie, movieDetailHref } = useCatalogPlay();

  if (titles.length === 0) return null;

  const items = titles.map((t) => {
    const href =
      kind === "movie"
        ? `/app/movies/${t.id}`
        : `/app/series/${t.id}`;
    return {
      id: t.id,
      href,
      poster: t.poster,
      title: t.title,
      subtitle: t.subtitle,
      rating: t.rating,
      isFavorite: isFavorite(kind, t.id),
      onToggleFavorite: () =>
        toggleFavorite({
          kind,
          id: t.id,
          name: t.title,
          icon: t.poster,
        }),
      ...(kind === "movie"
        ? {
            onClick: () =>
              playMovie({
                stream_id: t.id,
                name: t.title,
                stream_icon: t.poster ?? "",
                year: t.subtitle,
                rating: t.rating,
              }),
            detailHref: movieDetailHref({
              stream_id: t.id,
              name: t.title,
              stream_icon: t.poster,
            }),
          }
        : {}),
    };
  });

  return (
    <MediaShelf
      eyebrow="Because you watched"
      title="More like this"
      items={items}
    />
  );
}
