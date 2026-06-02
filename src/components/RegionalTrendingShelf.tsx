"use client";

import { ChannelArtworkCard } from "@/components/ChannelArtworkCard";
import { MediaCard } from "@/components/MediaCard";
import { SkeletonGrid } from "@/components/SectionHeader";
import { TvHomeRow } from "@/components/tv/TvHomeRow";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { buildImageProxy } from "@/lib/image-proxy";
import type { DiscoveryShelfMeta } from "@/lib/discovery/types";
import type { RegionalTrendingCard } from "@/lib/discovery/regional-trending-types";
import { prefetchLiveStreamManifest } from "@/lib/live-stream-prefetch";
import { buildLivePlayUrl } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

type RegionalTrendingShelfProps = {
  meta: DiscoveryShelfMeta;
  items: RegionalTrendingCard[];
  creds: XtreamCredentials;
  loading?: boolean;
  /** Grid layout for TV remotes (no sideways scroll). */
  tvLayout?: boolean;
  /** TV home spotlight grid (2026 hub). */
  tvHome?: boolean;
  onPlayLive: (card: RegionalTrendingCard) => void;
  isFavoriteLive: (streamId: number) => boolean;
  onToggleFavoriteLive: (card: RegionalTrendingCard) => void;
};

export function RegionalTrendingShelf({
  meta,
  items,
  creds,
  loading = false,
  tvLayout = false,
  tvHome = false,
  onPlayLive,
  isFavoriteLive,
  onToggleFavoriteLive,
}: RegionalTrendingShelfProps) {
  const useSpotlight = tvHome || tvLayout;
  const displayItems = tvHome ? items.slice(0, 6) : items;

  if (loading) {
    const body = (
      <SkeletonGrid
        variant={useSpotlight ? "tile" : "poster"}
        count={tvHome ? 6 : useSpotlight ? 6 : 8}
      />
    );
    if (tvHome) {
      return (
        <TvHomeRow title={meta.title} subtitle="Loading picks for you…">
          {body}
        </TvHomeRow>
      );
    }
    return (
      <section aria-busy="true" aria-label={meta.title}>
        <ShelfHeader meta={meta} tvLayout={useSpotlight} tvHome={tvHome} />
        {body}
      </section>
    );
  }

  if (displayItems.length === 0) return null;

  const renderCard = (card: RegionalTrendingCard, lead = false) => {
    if (card.kind === "live" && card.stream) {
      const url = buildLivePlayUrl(creds, card.stream);
      const prog = card.liveEntry?.programmeTitle;
      const subtitle = tvHome
        ? prog
          ? `▶ ${prog}`
          : undefined
        : prog
          ? `${card.signal} · ▶ ${prog}`
          : card.signal;
      return (
        <ChannelArtworkCard
          channelName={card.title}
          icon={card.stream.stream_icon}
          panelServer={creds.server}
          programmeTitle={prog}
          subtitle={subtitle}
          aspect={useSpotlight ? "video" : "poster"}
          badge={card.badge ?? "Live"}
          onClick={() => {
            prefetchLiveStreamManifest(url);
            onPlayLive(card);
          }}
          isFavorite={isFavoriteLive(card.stream.stream_id)}
          onToggleFavorite={() => onToggleFavoriteLive(card)}
          className={lead ? "h-full" : undefined}
        />
      );
    }

    return (
      <MediaCard
        title={card.title}
        poster={buildImageProxy(card.poster, creds.server)}
        panelServer={creds.server}
        badge={card.badge}
        subtitle={tvHome ? undefined : card.signal}
        rating={card.rating}
        href={card.href}
        isFavorite={card.isFavorite}
        onToggleFavorite={card.onToggleFavorite}
        className={lead ? "h-full" : undefined}
      />
    );
  };

  const grid = tvHome ? (
    <div className="tv-home-spotlight">
      {displayItems.map((card, i) => (
        <div
          key={card.key}
          className={cn(
            "tv-home-spotlight__cell",
            i === 0 && "tv-home-spotlight__cell--lead"
          )}
        >
          {renderCard(card, i === 0)}
        </div>
      ))}
    </div>
  ) : useSpotlight ? (
    <TvSpatialGrid className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {displayItems.map((card) => (
        <div key={card.key}>{renderCard(card)}</div>
      ))}
    </TvSpatialGrid>
  ) : (
    <div
      className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {displayItems.map((card) => (
        <div key={card.key} className="shrink-0 w-32 sm:w-36 md:w-40">
          {renderCard(card)}
        </div>
      ))}
    </div>
  );

  if (tvHome) {
    return (
      <TvHomeRow
        title={meta.title}
        subtitle="Movies, series, and live picks matched to your guide"
        seeAllHref={meta.seeAllHref}
      >
        {grid}
      </TvHomeRow>
    );
  }

  return (
    <section>
      <ShelfHeader meta={meta} tvLayout={useSpotlight} tvHome={tvHome} />
      {grid}
    </section>
  );
}

function ShelfHeader({
  meta,
  tvLayout,
  tvHome,
}: {
  meta: DiscoveryShelfMeta;
  tvLayout: boolean;
  tvHome: boolean;
}) {
  return (
    <div className="flex items-end justify-between mb-3 px-0">
      <div>
        {!tvHome && (
          <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
            {meta.eyebrow}
          </p>
        )}
        <h2
          className={
            tvLayout
              ? "text-xl sm:text-2xl font-bold text-(--text) leading-tight"
              : "text-base font-bold text-(--text) leading-tight"
          }
        >
          {meta.title}
        </h2>
        {meta.signal && !tvLayout && !tvHome && (
          <p className="text-xs text-(--text-dim) mt-1 max-w-xl">{meta.signal}</p>
        )}
      </div>
      {meta.seeAllHref && (
        <Link
          href={meta.seeAllHref}
          className="flex items-center gap-0.5 text-xs min-h-11 text-(--text-dim) hover:text-(--text) transition-colors shrink-0 px-2"
        >
          Browse
          <ChevronRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
