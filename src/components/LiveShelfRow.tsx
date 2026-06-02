"use client";

import { ShelfStreamCard } from "@/components/ShelfStreamCard";
import { TvShelf } from "@/components/TvShelf";
import {
  liveShelfRowPropsAreEqual,
  type LiveShelfRowMemoProps,
} from "@/lib/live-shelf-row-memo";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { memo } from "react";

export type LiveShelfRowProps = LiveShelfRowMemoProps & {
  creds: XtreamCredentials;
  variant?: "web" | "tv";
  onSeeAll: () => void;
  onPlay: (c: LiveStream) => void;
};

export const LiveShelfRow = memo(function LiveShelfRow({
  shelf,
  maxPerShelf,
  creds,
  activeStreamId,
  nowPlayingMap,
  variant = "tv",
  onSeeAll,
  onPlay,
}: LiveShelfRowProps) {
  return (
    <TvShelf
      title={shelf.title}
      onSeeAll={onSeeAll}
      moreCount={
        shelf.total > maxPerShelf ? shelf.total - maxPerShelf : undefined
      }
    >
      {shelf.preview.slice(0, maxPerShelf).map((c) => (
        <ShelfStreamCard
          key={c.stream_id}
          stream={c}
          credsServer={creds.server}
          active={activeStreamId === c.stream_id}
          onPlay={onPlay}
          variant={variant}
        />
      ))}
    </TvShelf>
  );
}, liveShelfRowPropsAreEqual);
