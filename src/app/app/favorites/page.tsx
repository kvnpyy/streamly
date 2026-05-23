"use client";

import { LiveChannelTile } from "@/components/LiveChannelTile";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { MediaCard } from "@/components/MediaCard";
import { SectionHeader } from "@/components/SectionHeader";
import { buildLivePlayUrl } from "@/lib/xtream";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { Heart } from "lucide-react";

export default function FavoritesPage() {
  const creds = useAuth((s) => s.creds)!;
  const { play } = usePlayer();
  const { favorites, isFavorite, toggleFavorite, addRecent } = usePrefs();

  const live = favorites.filter((f) => f.kind === "live");
  const movies = favorites.filter((f) => f.kind === "movie");
  const series = favorites.filter((f) => f.kind === "series");

  return (
    <div className="space-y-10">
      <SectionHeader
        eyebrow="Saved"
        title="Favorites"
        description="Your starred channels, movies, and series — all in one place."
      />

      {favorites.length === 0 && (
        <div className="card p-12 text-center text-(--text-dim)">
          <Heart className="size-7 mx-auto text-(--text-muted) mb-3" />
          <div className="text-base text-(--text)">No favorites yet</div>
          <div className="text-sm mt-1 text-(--text-muted)">
            Tap the heart on any channel, movie, or series to save it here.
          </div>
        </div>
      )}

      {live.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
            Live channels
          </h2>
          <TvSpatialGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {live.map((c) => (
              <LiveChannelTile
                key={c.id}
                streamId={c.id}
                name={c.name}
                icon={c.icon}
                isFavorite
                onToggleFavorite={() =>
                  toggleFavorite({ kind: c.kind, id: c.id, name: c.name, icon: c.icon })
                }
                onClick={() => {
                  play({
                    kind: "live",
                    id: c.id,
                    title: c.name,
                    poster: c.icon,
                    url: buildLivePlayUrl(creds, {
                      stream_id: c.id,
                      direct_source:
                        typeof c.meta?.direct_source === "string"
                          ? c.meta.direct_source
                          : undefined,
                    }),
                  });
                  addRecent(c);
                }}
              />
            ))}
          </TvSpatialGrid>
        </section>
      )}

      {movies.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
            Movies
          </h2>
          <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {movies.map((m) => (
              <MediaCard
                key={m.id}
                href={`/app/movies/${m.id}`}
                poster={m.icon}
                title={m.name}
                isFavorite={isFavorite("movie", m.id)}
                onToggleFavorite={() =>
                  toggleFavorite({ kind: m.kind, id: m.id, name: m.name, icon: m.icon })
                }
              />
            ))}
          </TvSpatialGrid>
        </section>
      )}

      {series.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
            Series
          </h2>
          <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {series.map((s) => (
              <MediaCard
                key={s.id}
                href={`/app/series/${s.id}`}
                poster={s.icon}
                title={s.name}
                isFavorite={isFavorite("series", s.id)}
                onToggleFavorite={() =>
                  toggleFavorite({ kind: s.kind, id: s.id, name: s.name, icon: s.icon })
                }
              />
            ))}
          </TvSpatialGrid>
        </section>
      )}
    </div>
  );
}
