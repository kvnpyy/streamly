"use client";

import type { TmdbCastMember } from "@/lib/tmdb-credits-types";
import { useQuery } from "@tanstack/react-query";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function CastGallery({
  tmdbId,
  title,
  year,
  mediaType,
  fallbackNames,
}: {
  tmdbId?: string | null;
  title: string;
  year?: string | null;
  mediaType: "movie" | "tv";
  /** Comma-separated cast from Xtream when TMDB is unavailable. */
  fallbackNames?: string | null;
}) {
  const credits = useQuery({
    queryKey: ["tmdb-credits", mediaType, tmdbId, title, year],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ type: mediaType });
      if (tmdbId?.trim()) params.set("tmdbId", tmdbId.trim());
      else {
        params.set("title", title);
        if (year) params.set("year", year.slice(0, 4));
      }
      const res = await fetch(`/api/tmdb/credits?${params}`, { signal });
      if (!res.ok) return { cast: [] as TmdbCastMember[] };
      return (await res.json()) as { cast: TmdbCastMember[] };
    },
    enabled: Boolean(tmdbId?.trim() || title.trim()),
    staleTime: 86_400_000,
  });

  const cast = credits.data?.cast ?? [];

  if (cast.length > 0) {
    return (
      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-dim) mb-3">
          Cast
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
          {cast.map((person) => (
            <figure
              key={person.id}
              className="flex-shrink-0 w-[88px] sm:w-[96px] snap-start text-center"
            >
              <div className="size-[88px] sm:size-[96px] rounded-2xl overflow-hidden bg-(--bg-3) ring-1 ring-white/10 mx-auto">
                {person.profileUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={person.profileUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="size-full grid place-items-center text-lg font-semibold text-white/50 bg-gradient-to-br from-(--bg-2) to-(--bg-3)">
                    {initials(person.name)}
                  </div>
                )}
              </div>
              <figcaption className="mt-2 min-w-0">
                <div className="text-xs font-medium text-white truncate">
                  {person.name}
                </div>
                {person.character ? (
                  <div className="text-[10px] text-(--text-muted) truncate mt-0.5">
                    {person.character}
                  </div>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  const names = (fallbackNames ?? "")
    .split(/[,/]/)
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (names.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-(--text-dim) mb-3">
        Cast
      </h2>
      <div className="flex flex-wrap gap-2">
        {names.map((name) => (
          <span
            key={name}
            className="chip text-(--text-dim)"
            title={name}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
