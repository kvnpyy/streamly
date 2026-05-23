"use client";

/**
 * LiveMediaCard — a poster-style MediaCard that fetches EPG data for a live
 * channel and shows the current programme title as the subtitle.
 *
 * Strategy (mirrors LiveChannelTile):
 *  1. On mount: read localStorage cache immediately — shows last-known title
 *     with zero latency and no flicker.
 *  2. When the card scrolls into view: fire useChannelEPG (provider short EPG
 *     → full EPG → external iptv-org fallback). Writes the result back to cache.
 */

import { MediaCard, type MediaCardProps } from "@/components/MediaCard";
import {
  inferCountryFromCategory,
  parseChannelMeta,
} from "@/lib/channel-meta";
import {
  decodeEpgText,
  useChannelEPG,
  useInView,
  useNow,
} from "@/lib/hooks";
import { epgProgramRangeUnixSec } from "@/lib/epg-time";
import {
  getCachedEpgTitle,
  setCachedEpgTitle,
} from "@/lib/epg-local-cache";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { useEffect, useMemo, useState } from "react";

type LiveMediaCardProps = Omit<MediaCardProps, "subtitle"> & {
  streamId: number;
  creds: XtreamCredentials;
  /** Xtream category title — improves public EPG country matching. */
  categoryLine?: string;
};

export function LiveMediaCard({
  streamId,
  creds,
  categoryLine,
  ...rest
}: LiveMediaCardProps) {
  const fallbackMeta = useMemo(() => parseChannelMeta(rest.title), [rest.title]);
  const countryCode =
    inferCountryFromCategory(categoryLine || "") || fallbackMeta.countryCode;

  // Seed from cache immediately — zero-latency display of last-known title.
  // This state is intentionally never updated after mount: nowPlaying (from
  // useChannelEPG) takes precedence via `nowPlaying ?? cachedTitle` once fresh
  // data arrives, avoiding a setState-in-effect that the React Compiler forbids.
  const [cachedTitle] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? getCachedEpgTitle(creds.server, creds.username, streamId)
      : null
  );

  const [ref, inView] = useInView<HTMLDivElement>("400px");
  const { programs } = useChannelEPG({
    streamId,
    enabled: inView,
    channelName: rest.title,
    country: countryCode,
  });
  const now = useNow(60_000);

  const nowPlaying = useMemo(() => {
    let current = programs.find((p) => {
      const r = epgProgramRangeUnixSec(p);
      return r !== null && r.start <= now && now < r.end;
    });
    if (!current) current = programs.find((p) => p.now_playing === 1);
    return current ? decodeEpgText(current.title) : undefined;
  }, [programs, now]);

  // Persist fresh EPG to localStorage so the next mount shows it instantly.
  // No setState here — nowPlaying already drives re-renders via useMemo above.
  useEffect(() => {
    if (!nowPlaying) return;
    setCachedEpgTitle(creds.server, creds.username, streamId, nowPlaying);
  }, [nowPlaying, creds.server, creds.username, streamId]);

  const displayTitle = nowPlaying ?? cachedTitle ?? undefined;

  return (
    <div ref={ref}>
      <MediaCard
        {...rest}
        subtitle={displayTitle ? `▶ ${displayTitle}` : undefined}
      />
    </div>
  );
}
