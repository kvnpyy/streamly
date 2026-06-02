"use client";

import { ChannelTile, ChannelTileProps } from "@/components/ChannelTile";
import {
  inferCountryFromCategory,
  parseChannelMeta,
} from "@/lib/channel-meta";
import { isLiveTileEpgEnabled } from "@/lib/live-epg-policy";
import {
  decodeEpgText,
  useChannelEPG,
  useInView,
  useNow,
} from "@/lib/hooks";
import { epgProgramRangeUnixSec } from "@/lib/epg-time";
import { useEffect, useMemo } from "react";

type LiveChannelTileProps = Omit<
  ChannelTileProps,
  | "nowPlaying"
  | "nextPlaying"
  | "nowProgress"
  | "endsIn"
  | "epgLoading"
  | "nowStart"
  | "nowEnd"
  | "nextStart"
  | "fallbackMeta"
> & {
  streamId: number;
  /** Set **`false`** to skip provider EPG requests on this tile (rare). Omit to
   *  always try short + full schedule by stream id even when `epg_channel_id` is missing. */
  hasEpgChannelId?: boolean;
  /** Fallback subtitle (e.g. category name) when no EPG is available. */
  fallbackSubtitle?: string;
  /** Xtream category title — improves public EPG region matching. */
  categoryLine?: string;
  /** Notify the parent which programme is currently airing on this
   *  channel, so the page can include it in the search index. */
  onNowPlaying?: (programTitle: string | undefined) => void;
  /** When set, skip provider EPG fetches and show this on-air title. */
  knownNowPlaying?: string;
};

function formatRemaining(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "ending";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h left` : `${h}h ${rem}m left`;
}

export function LiveChannelTile({
  streamId,
  hasEpgChannelId,
  fallbackSubtitle,
  categoryLine,
  onNowPlaying,
  knownNowPlaying,
  ...rest
}: LiveChannelTileProps) {
  const fallbackMeta = useMemo(
    () => parseChannelMeta(rest.name),
    [rest.name]
  );
  const countryCode =
    inferCountryFromCategory(categoryLine || "") ||
    fallbackMeta.countryCode;
  const [ref, inView] = useInView<HTMLDivElement>("250px");
  const skipEpg =
    Boolean(knownNowPlaying?.trim()) || !isLiveTileEpgEnabled();
  const { programs, isLoading, isResolved, skipped, sourceIsExternal } =
    useChannelEPG({
      streamId,
      hasEpgChannelId,
      enabled: inView && !skipEpg,
      channelName: rest.name,
      country: countryCode,
      shortLimit: 2,
    });
  const now = useNow(60_000);

  const {
    nowPlaying,
    nextPlaying,
    endsIn,
    nowProgress,
    nowStart,
    nowEnd,
    nextStart,
  } = useMemo(() => {
    let current = programs.find((p) => {
      const r = epgProgramRangeUnixSec(p);
      return r !== null && r.start <= now && now < r.end;
    });
    if (!current) current = programs.find((p) => p.now_playing === 1);
    const next = programs.find((p) => {
      const r = epgProgramRangeUnixSec(p);
      return r !== null && r.start > now;
    });

    let progress: number | undefined;
    let endsInLabel: string | undefined;
    let startSec: number | undefined;
    let endSec: number | undefined;
    if (current) {
      const r = epgProgramRangeUnixSec(current);
      if (r && r.end > r.start) {
        progress = Math.min(1, Math.max(0, (now - r.start) / (r.end - r.start)));
        endsInLabel = formatRemaining(r.end - now);
        startSec = r.start;
        endSec = r.end;
      }
    }
    const nextStartSec = next
      ? epgProgramRangeUnixSec(next)?.start
      : undefined;
    return {
      nowPlaying: current ? decodeEpgText(current.title) : undefined,
      nextPlaying: next ? decodeEpgText(next.title) : undefined,
      endsIn: endsInLabel,
      nowProgress: progress,
      nowStart: startSec,
      nowEnd: endSec,
      nextStart:
        nextStartSec && Number.isFinite(nextStartSec) ? nextStartSec : undefined,
    };
  }, [programs, now]);

  const displayNowPlaying = knownNowPlaying?.trim() || nowPlaying;

  useEffect(() => {
    if (onNowPlaying) onNowPlaying(displayNowPlaying);
  }, [displayNowPlaying, onNowPlaying]);

  const noScheduleAvailable =
    !displayNowPlaying &&
    (skipped || (isResolved && programs.length === 0));

  return (
    <div ref={ref}>
      <ChannelTile
        {...rest}
        nowPlaying={displayNowPlaying}
        nextPlaying={nextPlaying}
        endsIn={endsIn}
        nowProgress={nowProgress}
        nowStart={nowStart}
        nowEnd={nowEnd}
        nextStart={nextStart}
        epgLoading={inView && isLoading && !displayNowPlaying}
        epgSourceTag={sourceIsExternal ? "iptv-org" : undefined}
        fallbackSubtitle={
          noScheduleAvailable ? fallbackSubtitle : undefined
        }
        fallbackMeta={
          noScheduleAvailable && !fallbackMeta.isEmpty
            ? fallbackMeta
            : undefined
        }
      />
    </div>
  );
}
