"use client";

import type { MediaShelfItem } from "@/components/MediaShelf";
import { buildImageProxy, buildStreamUrl } from "@/lib/xtream";
import { buildMoviePlayerSourceFromRecent } from "@/lib/continue-watching";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";
import { parsePositiveRouteId } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { useCallback } from "react";

export function useCatalogPlay() {
  const creds = useAuth((s) => s.creds)!;
  const { play } = usePlayer();
  const addRecent = usePrefs((s) => s.addRecent);

  const playMovie = useCallback(
    (
      m: Pick<VodStream, "stream_id" | "name"> &
        Partial<Pick<VodStream, "stream_icon" | "year" | "rating" | "container_extension">>
    ) => {
      const mid = parsePositiveRouteId(m.stream_id);
      if (mid == null) return;
      const ext = m.container_extension || "mp4";
      play({
        kind: "movie",
        id: mid,
        title: m.name,
        subtitle: m.year,
        poster: m.stream_icon ? buildImageProxy(m.stream_icon) : undefined,
        url: buildStreamUrl(creds, "movie", mid, ext),
        containerExt: ext,
      });
      addRecent({
        kind: "movie",
        id: mid,
        name: m.name,
        icon: m.stream_icon,
      });
    },
    [creds, play, addRecent]
  );

  const movieDetailHref = useCallback(
    (m: Pick<VodStream, "stream_id" | "name"> & Partial<Pick<VodStream, "stream_icon">>) => {
    const mid = parsePositiveRouteId(m.stream_id);
    return mid != null ? `/app/movies/${mid}` : undefined;
  }, []);

  const seriesDetailHref = useCallback((s: SeriesItem) => {
    const sid = parsePositiveRouteId(s.series_id);
    return sid != null ? `/app/series/${sid}` : undefined;
  }, []);

  const enrichMovieShelfItems = useCallback(
    (items: MediaShelfItem[], catalog: VodStream[] | undefined) => {
      if (!catalog?.length) return items;
      const byId = new Map<number, VodStream>();
      for (const m of catalog) {
        const id = parsePositiveRouteId(m.stream_id);
        if (id != null) byId.set(id, m);
      }
      return items.map((item) => {
        const movie = byId.get(item.id);
        if (movie) {
          return {
            ...item,
            onClick: () => playMovie(movie),
            detailHref: item.href,
          };
        }
        return {
          ...item,
          onClick: () => {
            play(
              buildMoviePlayerSourceFromRecent(creds, {
                kind: "movie",
                id: item.id,
                name: item.title,
                icon: item.poster,
                addedAt: 0,
                lastAt: 0,
              })
            );
            addRecent({
              kind: "movie",
              id: item.id,
              name: item.title,
              icon: item.poster,
            });
          },
          detailHref: item.href,
        };
      });
    },
    [creds, play, addRecent, playMovie]
  );

  return {
    playMovie,
    movieDetailHref,
    seriesDetailHref,
    enrichMovieShelfItems,
  };
}
