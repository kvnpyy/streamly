"use client";

import { HomeRecentTile } from "@/components/home/HomeRecentTile";
import { TvHomeQuickNav } from "@/components/tv/TvHomeQuickNav";
import { TvHomeRow } from "@/components/tv/TvHomeRow";
import { TvShelf } from "@/components/TvShelf";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
  stubLiveStreamFromRecent,
} from "@/lib/live-flip-playlist";
import { buildHomeLiveChannelList } from "@/lib/home-live-channels";
import { buildLivePlayUrl } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { looksAdult } from "@/lib/utils";
import type { Favorite, RecentItem } from "@/store/preferences";
import type { PlayerSource } from "@/store/player";
import { Clapperboard, PlaySquare, Tv } from "lucide-react";
import { useMemo } from "react";

type TvHomeLightProps = {
  greetingName: string;
  creds: XtreamCredentials;
  recents: RecentItem[];
  favorites: Favorite[];
  hideAdult: boolean;
  parentalUnlocked: boolean;
  play: (s: PlayerSource, opts?: { playlist?: import("@/store/player").PlayerPlaylist }) => void;
  addRecent: (f: Omit<Favorite, "addedAt">) => void;
  isFavorite: (kind: Favorite["kind"], id: number) => boolean;
  toggleFavorite: (f: Omit<Favorite, "addedAt">) => void;
  showRichPrompt: boolean;
  onLoadRich: () => void;
};

export function TvHomeLight({
  greetingName,
  creds,
  recents,
  favorites,
  hideAdult,
  parentalUnlocked,
  play,
  addRecent,
  isFavorite,
  toggleFavorite,
  showRichPrompt,
  onLoadRich,
}: TvHomeLightProps) {
  const safe = hideAdult && !parentalUnlocked;
  const safeLiveChannels = useMemo(() => {
    const list = buildHomeLiveChannelList(recents, favorites);
    if (!safe) return list;
    return list.filter(
      (c) => !looksAdult({ name: c.name, is_adult: c.is_adult })
    );
  }, [recents, favorites, safe]);

  const recentSlice = useMemo(() => recents.slice(0, 8), [recents]);

  return (
    <div className="tv-home">
      <header className="tv-home__hero">
        <h1 className="tv-home__greeting">
          Hey <span>{greetingName}</span>
        </h1>
        <TvHomeQuickNav
          items={[
            { href: "/app/live", label: "Live TV", icon: Tv },
            { href: "/app/movies", label: "Movies", icon: Clapperboard },
            { href: "/app/series", label: "Series", icon: PlaySquare },
          ]}
        />
      </header>

      {recentSlice.length > 0 && (
        <TvHomeRow
          title="Continue watching"
          seeAllHref="/app/favorites"
          className="tv-home-continue"
        >
          <TvShelf title="Continue" hideTitle seeAllHref="/app/favorites">
            {recentSlice.map((r) => (
              <div
                key={r.kind === "live" ? `live-${r.id}` : `${r.kind}-${r.id}`}
                className="tv-home-shelf-card w-36 shrink-0"
              >
                <HomeRecentTile
                  recent={r}
                  badge={r.kind === "live" ? "Live" : r.kind === "movie" ? "Movie" : "Series"}
                  isFavorite={isFavorite(r.kind, r.id)}
                  onToggleFavorite={() =>
                    toggleFavorite({
                      kind: r.kind,
                      id: r.id,
                      name: r.name,
                      icon: r.icon,
                    })
                  }
                  href={
                    r.kind === "movie"
                      ? `/app/movies/${r.id}`
                      : r.kind === "series"
                        ? `/app/series/${r.id}`
                        : undefined
                  }
                  onPlay={
                    r.kind === "live"
                      ? () => {
                          const stream = stubLiveStreamFromRecent(r);
                          const flipStreams = recents
                            .filter((x) => x.kind === "live")
                            .map(stubLiveStreamFromRecent);
                          play(liveStreamToPlayerSource(creds, stream), {
                            playlist: buildLiveFlipPlaylist(
                              creds,
                              flipStreams.length > 1
                                ? flipStreams
                                : safeLiveChannels
                            ),
                          });
                          addRecent(r);
                        }
                      : undefined
                  }
                />
              </div>
            ))}
          </TvShelf>
        </TvHomeRow>
      )}

      {showRichPrompt && (
        <div className="tv-home__rich-prompt card p-6 text-center space-y-3 mx-4">
          <p className="text-sm text-(--text-muted) text-pretty">
            On now, trending, and movie shelves load your full catalog and may
            pause older TVs. Open Live TV or Movies instead, or load shelves
            here.
          </p>
          <button
            type="button"
            onClick={onLoadRich}
            className="inline-flex items-center justify-center h-11 px-6 rounded-xl btn-brand text-sm font-medium"
          >
            Load home shelves
          </button>
        </div>
      )}
    </div>
  );
}
