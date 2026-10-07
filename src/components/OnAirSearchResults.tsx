"use client";

import { ChannelTile } from "@/components/ChannelTile";
import { VirtualChannelTileGrid } from "@/components/VirtualChannelTileGrid";
import {
  useOnAirSearch,
  type OnAirSearchMatch,
} from "@/hooks/use-on-air-search";
import type { TvRegion } from "@/lib/geo-continent";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
} from "@/lib/live-flip-playlist";
import { useNow } from "@/lib/hooks";
import { MIN_SEARCH_QUERY_LEN } from "@/lib/search-normalize";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { useMemo } from "react";

const EMPTY_MATCHES: OnAirSearchMatch[] = [];

function programmeProgress(match: OnAirSearchMatch, nowSec: number): number | undefined {
  if (match.slot !== "now" || match.start <= 0 || match.end <= match.start) {
    return undefined;
  }
  return Math.min(1, Math.max(0, (nowSec - match.start) / (match.end - match.start)));
}

export function OnAirSearchResults({
  creds,
  query,
  categoryId = "all",
  tvRegion,
  onPlay,
}: {
  creds: XtreamCredentials;
  query: string;
  categoryId?: string | "all";
  tvRegion?: TvRegion;
  /** When omitted, the result plays with the other guide matches as the channel list. */
  onPlay?: (stream: LiveStream, matches: LiveStream[]) => void;
}) {
  const needle = query.trim().toLowerCase();
  const hideAdult = usePrefs((s) => s.hideAdult);
  const parentalUnlocked = usePrefs((s) => s.parentalUnlocked);
  const safe = hideAdult && !parentalUnlocked;
  const isFavorite = usePrefs((s) => s.isFavorite);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const addRecent = usePrefs((s) => s.addRecent);
  const play = usePlayer((s) => s.play);

  const search = useOnAirSearch(
    creds,
    needle,
    categoryId,
    tvRegion,
    safe
  );

  const matches = search.data?.matches ?? EMPTY_MATCHES;
  const nowSec = useNow(60_000);
  const nowRows = useMemo(
    () => matches.filter((m) => m.slot === "now"),
    [matches]
  );
  const upcomingRows = useMemo(
    () => matches.filter((m) => m.slot === "upcoming"),
    [matches]
  );
  const playlistStreams = useMemo(
    () => matches.map((m) => m.stream),
    [matches]
  );

  if (needle.length < MIN_SEARCH_QUERY_LEN) return null;
  if (
    !search.isLoading &&
    !search.isError &&
    nowRows.length === 0 &&
    upcomingRows.length === 0
  ) {
    return null;
  }

  const playMatch = (stream: LiveStream) => {
    if (onPlay) {
      onPlay(stream, playlistStreams);
      return;
    }
    play(liveStreamToPlayerSource(creds, stream), {
      playlist: buildLiveFlipPlaylist(creds, playlistStreams),
    });
    addRecent({
      kind: "live",
      id: stream.stream_id,
      name: stream.name,
      icon: stream.stream_icon,
      ...(stream.direct_source?.trim()
        ? { meta: { direct_source: stream.direct_source.trim() } }
        : {}),
    });
  };

  const renderMatch = (match: OnAirSearchMatch) => {
    const stream = match.stream;
    return (
      <ChannelTile
        number={stream.num}
        name={stream.name}
        icon={stream.stream_icon}
        nowPlaying={match.title}
        airing={match.slot === "upcoming" ? "upcoming" : "now"}
        nowStart={match.start > 0 ? match.start : undefined}
        nowEnd={match.end > 0 ? match.end : undefined}
        nowProgress={programmeProgress(match, nowSec)}
        isFavorite={isFavorite("live", stream.stream_id)}
        onToggleFavorite={() =>
          toggleFavorite({
            kind: "live",
            id: stream.stream_id,
            name: stream.name,
            icon: stream.stream_icon,
            ...(stream.direct_source?.trim()
              ? { meta: { direct_source: stream.direct_source.trim() } }
              : {}),
          })
        }
        onClick={() => playMatch(stream)}
      />
    );
  };

  return (
    <div className="space-y-6">
      {search.isLoading ? (
        <p className="text-xs text-(--text-muted)" role="status">
          Checking the TV guide for what’s on…
        </p>
      ) : null}
      {search.isError ? (
        <p className="text-xs text-(--text-muted)">
          Couldn’t check the TV guide.{" "}
          <button
            type="button"
            className="underline text-(--text)"
            onClick={() => void search.refetch()}
          >
            Retry
          </button>
        </p>
      ) : null}
      {nowRows.length > 0 ? (
        <section aria-label="On now">
          <h3 className="text-sm uppercase tracking-wider text-(--text-muted) mb-3">
            On now ({nowRows.length})
          </h3>
          <VirtualChannelTileGrid
            items={nowRows}
            itemKey={(m) => m.stream.stream_id}
            renderItem={renderMatch}
          />
        </section>
      ) : null}
      {upcomingRows.length > 0 ? (
        <section aria-label="Coming up">
          <h3 className="text-sm uppercase tracking-wider text-(--text-muted) mb-1">
            Coming up ({upcomingRows.length})
          </h3>
          <p className="text-xs text-(--text-dim) mb-3">
            Starts within the next 6 hours.
          </p>
          <VirtualChannelTileGrid
            items={upcomingRows}
            itemKey={(m) => `${m.stream.stream_id}-${m.start}`}
            renderItem={renderMatch}
          />
        </section>
      ) : null}
    </div>
  );
}
