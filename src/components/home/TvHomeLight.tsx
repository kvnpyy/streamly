"use client";

import { HomeRecentTile } from "@/components/home/HomeRecentTile";
import { TvHomeQuickNav } from "@/components/tv/TvHomeQuickNav";
import { TvHomeRow } from "@/components/tv/TvHomeRow";
import { TvShelf } from "@/components/TvShelf";
import { buildHomeLiveChannelList } from "@/lib/home-live-channels";
import {
  FeaturedSpotlightHero,
  playFeaturedSpotlight,
} from "@/components/home/FeaturedSpotlight";
import { CONTINUE_WATCHING_PATH, continueDetailHref } from "@/lib/continue-watching";
import { pickFeaturedSpotlight } from "@/lib/featured-spotlight";
import { useContinueRecentPlay } from "@/hooks/use-continue-recent-play";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { looksAdult } from "@/lib/utils";
import {
  browseAccountKey,
  type Favorite,
  type RecentItem,
  usePrefs,
} from "@/store/preferences";
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
}: TvHomeLightProps) {
  const vodResumeSec = usePrefs((s) => s.vodResumeSec);
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);
  const spotlight = useMemo(
    () => pickFeaturedSpotlight(recents, accountKey, vodResumeSec),
    [recents, accountKey, vodResumeSec]
  );
  const spotlightRecent = useMemo(
    () =>
      spotlight
        ? recents.find(
            (r) => r.kind === spotlight.kind && r.id === spotlight.id
          )
        : undefined,
    [recents, spotlight]
  );
  const safe = hideAdult && !parentalUnlocked;
  const safeLiveChannels = useMemo(() => {
    const list = buildHomeLiveChannelList(recents, favorites);
    if (!safe) return list;
    return list.filter(
      (c) => !looksAdult({ name: c.name, is_adult: c.is_adult })
    );
  }, [recents, favorites, safe]);

  const recentSlice = useMemo(() => recents.slice(0, 8), [recents]);
  const { playRecent, progressPctFor } = useContinueRecentPlay(
    creds,
    recents,
    play,
    addRecent,
    safeLiveChannels.map((c) => ({
      kind: "live" as const,
      id: c.stream_id,
      name: c.name,
      icon: c.stream_icon,
      addedAt: 0,
      lastAt: 0,
      meta: c.direct_source?.trim()
        ? { direct_source: c.direct_source.trim() }
        : undefined,
    }))
  );

  return (
    <div className="tv-home">
      {spotlight && spotlightRecent ? (
        <FeaturedSpotlightHero
          compact
          spotlight={spotlight}
          creds={creds}
          recent={spotlightRecent}
          onPlay={() =>
            playFeaturedSpotlight(
              spotlight,
              creds,
              spotlightRecent,
              play,
              addRecent
            )
          }
        />
      ) : (
        <header className="tv-home__hero">
          <h1 className="tv-home__greeting">
            {greetingName === "there" ? (
              <>What are we watching?</>
            ) : (
              <>
                Hey <span>{greetingName}</span>
              </>
            )}
          </h1>
          <TvHomeQuickNav
            items={[
              { href: "/app/live", label: "Live TV", icon: Tv },
              { href: "/app/movies", label: "Movies", icon: Clapperboard },
              { href: "/app/series", label: "Series", icon: PlaySquare },
            ]}
          />
        </header>
      )}

      {recentSlice.length > 0 && (
        <TvHomeRow
          title="Continue watching"
          seeAllHref={CONTINUE_WATCHING_PATH}
          className="tv-home-continue"
        >
          <TvShelf title="Continue" hideTitle seeAllHref={CONTINUE_WATCHING_PATH}>
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
                      meta: r.meta,
                    })
                  }
                  onPlay={() => playRecent(r)}
                  detailHref={continueDetailHref(r)}
                  progressPct={progressPctFor(r)}
                />
              </div>
            ))}
          </TvShelf>
        </TvHomeRow>
      )}
    </div>
  );
}
