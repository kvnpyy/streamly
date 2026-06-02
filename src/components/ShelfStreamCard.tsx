"use client";

import { TvChannelCard } from "@/components/TvChannelCard";
import type { LiveStream } from "@/lib/xtream-types";
import { memo, useCallback } from "react";

/** Memoized shelf tile — stable click handler per stream row. */
export const ShelfStreamCard = memo(function ShelfStreamCard({
  stream,
  credsServer,
  active,
  onPlay,
  variant = "web",
}: {
  stream: LiveStream;
  credsServer: string;
  active: boolean;
  onPlay: (c: LiveStream) => void;
  variant?: "web" | "tv";
}) {
  const onClick = useCallback(() => onPlay(stream), [onPlay, stream]);

  return (
    <TvChannelCard
      variant={variant}
      name={stream.name}
      icon={stream.stream_icon}
      panelServer={credsServer}
      active={active}
      onClick={onClick}
    />
  );
});
