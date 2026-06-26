"use client";

import { TvChannelCard } from "@/components/TvChannelCard";
import type { LiveStream } from "@/lib/xtream-types";
import { memo, useCallback } from "react";

/** Memoized shelf tile — stable click handler per stream row. */
export const ShelfStreamCard = memo(function ShelfStreamCard({
  stream,
  credsServer,
  nowPlaying,
  active,
  onPlay,
  variant = "web",
}: {
  stream: LiveStream;
  credsServer: string;
  nowPlaying?: string;
  active: boolean;
  onPlay: (c: LiveStream) => void;
  variant?: "web" | "tv";
}) {
  const onClick = useCallback(() => onPlay(stream), [onPlay, stream]);

  return (
    <div className={variant === "tv" ? "tv-live-channel-card shrink-0" : undefined}>
      <TvChannelCard
        variant={variant}
        name={stream.name}
        icon={stream.stream_icon}
        panelServer={credsServer}
        nowPlaying={nowPlaying}
        active={active}
        onClick={onClick}
      />
    </div>
  );
});
