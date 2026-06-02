"use client";

import { LiveChannelTile } from "@/components/LiveChannelTile";
import type { LiveStream } from "@/lib/xtream-types";
import { memo } from "react";

export type LiveChannelGridTileProps = {
  stream: LiveStream;
  categoryLine?: string;
  knownNowPlaying?: string;
  isFavorite: boolean;
  onNowPlaying?: (title: string | undefined) => void;
  onToggleFavorite: () => void;
  onPlay: () => void;
};

export const LiveChannelGridTile = memo(function LiveChannelGridTile({
  stream,
  categoryLine,
  knownNowPlaying,
  isFavorite,
  onNowPlaying,
  onToggleFavorite,
  onPlay,
}: LiveChannelGridTileProps) {
  return (
    <LiveChannelTile
      streamId={stream.stream_id}
      knownNowPlaying={knownNowPlaying}
      categoryLine={categoryLine}
      fallbackSubtitle={categoryLine}
      number={stream.num}
      name={stream.name}
      icon={stream.stream_icon}
      isFavorite={isFavorite}
      onNowPlaying={onNowPlaying}
      onToggleFavorite={onToggleFavorite}
      onClick={onPlay}
    />
  );
});
