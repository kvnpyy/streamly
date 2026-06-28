"use client";

import type { FeaturedSpotlight } from "@/lib/featured-spotlight";
import { buildImageProxy, buildLivePlayUrl } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
  stubLiveStreamFromRecent,
} from "@/lib/live-flip-playlist";
import { resolvePlayerSourceFromRecent } from "@/lib/continue-watching";
import type { RecentItem } from "@/store/preferences";
import { Info, Play } from "lucide-react";
import Link from "next/link";

type FeaturedSpotlightHeroProps = {
  spotlight: FeaturedSpotlight;
  creds: XtreamCredentials;
  recent: RecentItem;
  onPlay: () => void;
  compact?: boolean;
};

export function FeaturedSpotlightHero({
  spotlight,
  creds,
  recent,
  onPlay,
  compact = false,
}: FeaturedSpotlightHeroProps) {
  const backdrop = spotlight.poster
    ? buildImageProxy(spotlight.poster)
    : undefined;

  return (
    <section
      className={
        compact
          ? "tv-home__hero relative overflow-hidden rounded-2xl border border-(--line)"
          : "relative overflow-hidden rounded-2xl border border-(--line) min-h-[220px] sm:min-h-[280px]"
      }
    >
      {backdrop && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backdrop}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-(--bg-0) via-(--bg-0)/85 to-(--bg-0)/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-(--bg-0) via-transparent to-transparent" />
        </>
      )}
      {!backdrop && (
        <div className="absolute inset-0 bg-gradient-to-br from-(--brand)/25 via-(--bg-2) to-(--bg-0)" />
      )}

      <div
        className={
          compact
            ? "relative p-5 sm:p-6"
            : "relative p-6 sm:p-10 flex flex-col justify-end min-h-[inherit]"
        }
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--brand-2) mb-2">
          {spotlight.eyebrow}
        </p>
        <h2
          className={
            compact
              ? "text-2xl sm:text-3xl font-semibold tracking-tight text-(--text) max-w-xl"
              : "text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-(--text) max-w-2xl"
          }
        >
          {spotlight.title}
        </h2>
        {spotlight.subtitle && (
          <p className="text-sm text-(--text-dim) mt-2 max-w-lg">
            {spotlight.subtitle}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-5">
          <button
            type="button"
            data-tv-card-root
            tabIndex={0}
            onClick={onPlay}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl btn-brand font-medium text-sm"
          >
            <Play className="size-4 fill-white" />
            {spotlight.ctaLabel}
          </button>
          <Link
            href={spotlight.detailHref}
            data-tv-card-root
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-medium transition-colors"
          >
            <Info className="size-4" />
            More info
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Resolve play action for a spotlight pick. */
export async function playFeaturedSpotlight(
  spotlight: FeaturedSpotlight,
  creds: XtreamCredentials,
  recent: RecentItem,
  play: (
    source: import("@/store/player").PlayerSource,
    opts?: { playlist?: import("@/store/player").PlayerPlaylist }
  ) => void,
  addRecent: (item: Omit<RecentItem, "lastAt" | "addedAt">) => void
) {
  if (spotlight.kind === "live") {
    const stream = stubLiveStreamFromRecent(recent);
    play(liveStreamToPlayerSource(creds, stream), {
      playlist: buildLiveFlipPlaylist(creds, [stream]),
    });
    addRecent(recent);
    return;
  }
  const source = await resolvePlayerSourceFromRecent(creds, recent);
  if (source) {
    play(source);
    addRecent(recent);
  }
}
