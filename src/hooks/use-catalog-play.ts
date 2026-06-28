"use client";

import type { MediaShelfItem } from "@/components/MediaShelf";
import { buildImageProxy } from "@/lib/xtream";
import { resolveMoviePlayerSourceFromRecent } from "@/lib/continue-watching";
import { resolveMoviePlayUrl } from "@/lib/vod-format-probe";
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
    async (
      m: Pick<VodStream, "stream_id" | "name"> &
        Partial<
          Pick<
            VodStream,
            "stream_icon" | "year" | "rating" | "container_extension" | "direct_source"
          >
        >
    ) => {
      const mid = parsePositiveRouteId(m.stream_id);
      if (mid == null) return;
      const { proxyUrl, containerExt } = await resolveMoviePlayUrl(creds, {
        stream_id: mid,
        container_extension: m.container_extension,
        direct_source: m.direct_source,
      });
      play({
        kind: "movie",
        id: mid,
        title: m.name,
        subtitle: m.year,
        poster: m.stream_icon ? buildImageProxy(m.stream_icon) : undefined,
        url: proxyUrl,
        containerExt,
      });
      addRecent({
        kind: "movie",
        id: mid,
        name: m.name,
        icon: m.stream_icon,
        meta: { containerExt },
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
            onClick: () => void playMovie(movie),
            detailHref: item.href,
          };
        }
        return {
          ...item,
          onClick: () => {
            void (async () => {
              play(
                await resolveMoviePlayerSourceFromRecent(creds, {
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
            })();
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
