"use client";

import { ChannelArtworkCard } from "@/components/ChannelArtworkCard";
import { SkeletonGrid } from "@/components/SectionHeader";
import { TvHomeRow } from "@/components/tv/TvHomeRow";
import { TvShelf } from "@/components/TvShelf";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import type { DiscoveryShelfMeta } from "@/lib/discovery/types";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { prefetchLiveStreamManifest } from "@/lib/live-stream-prefetch";
import { buildLivePlayUrl } from "@/lib/xtream";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

type LiveDiscoveryShelfProps = {
  meta: DiscoveryShelfMeta;
  items: ScoredLiveEntry[];
  creds: XtreamCredentials;
  loading?: boolean;
  tvLayout?: boolean;
  tvHome?: boolean;
  onPlay: (entry: ScoredLiveEntry) => void;
  isFavorite: (streamId: number) => boolean;
  onToggleFavorite: (entry: ScoredLiveEntry) => void;
};

function LiveDiscoveryCard({
  entry,
  creds,
  onPlay,
  isFavorite,
  onToggleFavorite,
  tvHome,
}: {
  entry: ScoredLiveEntry;
  creds: XtreamCredentials;
  onPlay: (entry: ScoredLiveEntry) => void;
  isFavorite: (streamId: number) => boolean;
  onToggleFavorite: (entry: ScoredLiveEntry) => void;
  tvHome?: boolean;
}) {
  const url = buildLivePlayUrl(creds, entry.stream);
  const subtitle = tvHome
    ? `▶ ${entry.programmeTitle}`
  : entry.detail
      ? `▶ ${entry.programmeTitle} · ${entry.detail}`
      : `▶ ${entry.programmeTitle}`;

  return (
    <ChannelArtworkCard
      channelName={entry.stream.name}
      icon={entry.stream.stream_icon}
      panelServer={creds.server}
      programmeTitle={entry.programmeTitle}
      subtitle={subtitle}
      aspect="video"
      badge="Live"
      onClick={() => {
        prefetchLiveStreamManifest(url);
        onPlay(entry);
      }}
      isFavorite={isFavorite(entry.stream.stream_id)}
      onToggleFavorite={() => onToggleFavorite(entry)}
    />
  );
}

export function LiveDiscoveryShelf({
  meta,
  items,
  creds,
  loading = false,
  tvLayout = false,
  tvHome = false,
  onPlay,
  isFavorite,
  onToggleFavorite,
}: LiveDiscoveryShelfProps) {
  if (loading) {
    const skeleton = (
      <SkeletonGrid variant="tile" count={tvHome ? 5 : tvLayout ? 6 : 8} />
    );
    if (tvHome) {
      return (
        <TvHomeRow title={meta.title} subtitle={meta.eyebrow}>
          {skeleton}
        </TvHomeRow>
      );
    }
    return (
      <section aria-busy="true" aria-label={meta.title}>
        <ShelfHeader meta={meta} tvLayout={tvLayout || tvHome} />
        {skeleton}
      </section>
    );
  }

  if (items.length === 0) return null;

  const cards = items.map((entry) => (
    <div key={entry.stream.stream_id} className={tvHome ? "tv-home-shelf-card" : undefined}>
      <LiveDiscoveryCard
        entry={entry}
        creds={creds}
        onPlay={onPlay}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        tvHome={tvHome}
      />
    </div>
  ));

  if (tvHome) {
    return (
      <TvHomeRow
        title={meta.title}
        subtitle={meta.eyebrow}
        seeAllHref={meta.seeAllHref}
      >
        <TvShelf title={meta.title} hideTitle seeAllHref={meta.seeAllHref}>
          {cards}
        </TvShelf>
      </TvHomeRow>
    );
  }

  return (
    <section>
      <ShelfHeader meta={meta} tvLayout={tvLayout} />
      {tvLayout ? (
        <TvSpatialGrid className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {cards}
        </TvSpatialGrid>
      ) : (
        <div
          className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {cards}
        </div>
      )}
    </section>
  );
}

function ShelfHeader({
  meta,
  tvLayout,
}: {
  meta: DiscoveryShelfMeta;
  tvLayout: boolean;
}) {
  return (
    <div className="flex items-end justify-between mb-3 px-0">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
          {meta.eyebrow}
        </p>
        <h2
          className={
            tvLayout
              ? "text-xl sm:text-2xl font-bold text-(--text) leading-tight"
              : "text-base font-bold text-(--text) leading-tight"
          }
        >
          {meta.title}
        </h2>
      </div>
      {meta.seeAllHref && (
        <Link
          href={meta.seeAllHref}
          className="flex items-center gap-0.5 text-xs min-h-11 text-(--text-dim) hover:text-(--text) transition-colors shrink-0 px-2"
        >
          See all
          <ChevronRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
