"use client";

import dynamic from "next/dynamic";
import { SkeletonGrid } from "@/components/SectionHeader";
import { LIVE_GUIDE_MAX_CHANNELS } from "@/lib/live-guide-limits";
import type { LiveStream } from "@/lib/xtream-types";

const LiveGuide = dynamic(
  () =>
    import("@/components/LiveGuide").then((m) => ({ default: m.LiveGuide })),
  { loading: () => <SkeletonGrid variant="tile" count={6} /> }
);

type LiveGuidePanelProps = {
  channels: LiveStream[];
  categoryNameById: Record<string, string>;
  isFavorite: (id: number) => boolean;
  onToggleFavorite: (c: LiveStream) => void;
  onPlay: (c: LiveStream) => void;
  allCategoriesMode: boolean;
  /** Couch / TV browsers — copy tuned for remote + category modal. */
  livingRoomGuide?: boolean;
};

export function LiveGuidePanel({
  channels,
  categoryNameById,
  isFavorite,
  onToggleFavorite,
  onPlay,
  allCategoriesMode,
  livingRoomGuide = false,
}: LiveGuidePanelProps) {
  const limit = allCategoriesMode
    ? Math.min(LIVE_GUIDE_MAX_CHANNELS, livingRoomGuide ? 36 : 48)
    : LIVE_GUIDE_MAX_CHANNELS;

  return (
    <div className="space-y-2">
      {allCategoriesMode && channels.length > limit && (
        <p className="text-xs text-(--text-muted) card px-3 py-2 text-pretty">
          The guide is limited to {limit} channels while browsing all categories.
          {livingRoomGuide
            ? " Open Categories above to pick a group, or switch to List for shelf browse."
            : " Pick a category in the sidebar for a focused guide, or use List view for the full channel list."}
        </p>
      )}
      <LiveGuide
        channels={channels}
        channelLimit={limit}
        categoryNameById={categoryNameById}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onPlay={onPlay}
      />
    </div>
  );
}
