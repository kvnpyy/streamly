"use client";

import { MediaShelf } from "@/components/MediaShelf";
import { useMovieCollection } from "@/hooks/use-movie-collection";
import { buildImageProxy } from "@/lib/xtream";
import type { MatchedCollectionPart } from "@/lib/movie-collection";
import { useCatalogPlay } from "@/hooks/use-catalog-play";
import { useAuth } from "@/store/auth";
import { usePrefs } from "@/store/preferences";

function relationBadge(part: MatchedCollectionPart): string | undefined {
  if (part.relation === "prequel") return "Prequel";
  if (part.relation === "sequel") return "Sequel";
  if (part.relation === "current") return "This movie";
  return undefined;
}

export function MovieCollectionShelf({
  title,
  year,
  tmdbId,
  streamId,
}: {
  title: string;
  year?: string;
  tmdbId?: string | null;
  streamId: number;
}) {
  const creds = useAuth((s) => s.creds);
  const hideAdult = usePrefs((s) => s.hideAdult);
  const parentalUnlocked = usePrefs((s) => s.parentalUnlocked);
  const { playMovie, movieDetailHref } = useCatalogPlay();
  const collection = useMovieCollection({
    enabled: true,
    creds,
    title,
    year,
    tmdbId,
    streamId,
    safe: hideAdult && !parentalUnlocked,
  });

  if (!collection.hasOthers) return null;

  const items = collection.parts.map((part) => {
    const poster = buildImageProxy(part.catalogIcon || part.posterUrl || undefined);
    const href = `/app/movies/${part.streamId}`;
    const current = part.isCurrent;
    return {
      id: part.streamId,
      href,
      poster,
      title: part.catalogName,
      subtitle: part.year,
      badge: relationBadge(part),
      ...(current
        ? {}
        : {
            onClick: () =>
              void playMovie({
                stream_id: part.streamId,
                name: part.catalogName,
                stream_icon: part.catalogIcon,
                year: part.year,
                container_extension: part.containerExtension,
                direct_source: part.directSource,
                tmdbId: String(part.tmdbId),
              }),
            detailHref: movieDetailHref({
              stream_id: part.streamId,
              name: part.catalogName,
              stream_icon: part.catalogIcon,
            }),
          }),
    };
  });

  return (
    <div className="mt-12">
      <MediaShelf
        eyebrow="Prequels & sequels"
        title={collection.collectionName || "In this series"}
        items={items}
      />
    </div>
  );
}
