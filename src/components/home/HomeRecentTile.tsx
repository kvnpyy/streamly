"use client";

import { buildImageProxy } from "@/lib/xtream";
import type { RecentItem } from "@/store/preferences";
import { cn } from "@/lib/utils";
import { Heart, Info, Play } from "lucide-react";
import Link from "next/link";

type HomeRecentTileProps = {
  recent: RecentItem;
  onPlay?: () => void;
  /** Fallback navigation when `onPlay` is absent. */
  href?: string;
  /** Secondary link — e.g. detail page while primary action is resume. */
  detailHref?: string;
  badge: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** 0–100 watch progress; null hides the bar. */
  progressPct?: number | null;
};

/** Lightweight continue-watching tile — no EPG, no intersection observers. */
export function HomeRecentTile({
  recent,
  onPlay,
  href,
  detailHref,
  badge,
  isFavorite,
  onToggleFavorite,
  progressPct,
}: HomeRecentTileProps) {
  const poster = recent.icon ? buildImageProxy(recent.icon) : undefined;
  const showProgress = progressPct != null && progressPct > 0;
  const infoHref = detailHref ?? (onPlay ? undefined : href);

  const inner = (
    <div className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-(--bg-3) border border-(--line) hover:border-(--line-2) transition-colors focus-within:border-(--brand)/50">
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-(--text-muted) px-2 text-center">
          {recent.name}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <span className="absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-black/50 text-white">
        {badge}
      </span>
      {onToggleFavorite && (
        <button
          type="button"
          aria-label={isFavorite ? "Remove from My List" : "Add to My List"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-2 right-2 size-8 rounded-lg bg-black/45 grid place-items-center text-white/90 hover:bg-black/60 z-10"
        >
          <Heart className={`size-4 ${isFavorite ? "fill-(--danger) text-(--danger)" : ""}`} />
        </button>
      )}
      {infoHref && onPlay && (
        <Link
          href={infoHref}
          aria-label={`More info about ${recent.name}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-12 size-8 rounded-lg bg-black/45 grid place-items-center text-white/90 hover:bg-black/60 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        >
          <Info className="size-4" />
        </Link>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <p className="text-sm font-medium text-white line-clamp-2 leading-snug">
          {recent.name}
        </p>
      </div>
      {showProgress && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1 bg-white/25"
          aria-hidden
        >
          <div
            className="h-full bg-(--danger) transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
      {(onPlay || href) && (
        <div
          className={cn(
            "absolute inset-0 grid place-items-center transition-opacity bg-black/25",
            onPlay
              ? "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
              : "opacity-0 group-hover:opacity-100"
          )}
        >
          <div className="size-10 rounded-full btn-brand grid place-items-center">
            <Play className="size-4 fill-white ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );

  if (onPlay) {
    return (
      <button
        type="button"
        data-tv-card-root
        tabIndex={0}
        onClick={onPlay}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPlay();
          }
        }}
        className="block w-full min-w-0 text-left focus-ring rounded-xl [&:focus-visible]:relative [&:focus-visible]:z-[1]"
      >
        {inner}
      </button>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        data-tv-card-root
        tabIndex={0}
        className="block min-w-0 focus-ring rounded-xl [&:focus-visible]:relative [&:focus-visible]:z-[1]"
      >
        {inner}
      </Link>
    );
  }

  return <div className="block min-w-0">{inner}</div>;
}
