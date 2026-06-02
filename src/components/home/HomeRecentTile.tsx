"use client";

import { buildImageProxy } from "@/lib/xtream";
import type { RecentItem } from "@/store/preferences";
import { Heart, Play } from "lucide-react";
import Link from "next/link";

type HomeRecentTileProps = {
  recent: RecentItem;
  onPlay?: () => void;
  href?: string;
  badge: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
};

/** Lightweight continue-watching tile — no EPG, no intersection observers. */
export function HomeRecentTile({
  recent,
  onPlay,
  href,
  badge,
  isFavorite,
  onToggleFavorite,
}: HomeRecentTileProps) {
  const poster = recent.icon ? buildImageProxy(recent.icon) : undefined;
  const inner = (
    <div className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-(--bg-3) border border-(--line) hover:border-(--line-2) transition-colors">
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
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-2 right-2 size-8 rounded-lg bg-black/45 grid place-items-center text-white/90 hover:bg-black/60"
        >
          <Heart className={`size-4 ${isFavorite ? "fill-(--danger) text-(--danger)" : ""}`} />
        </button>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <p className="text-sm font-medium text-white line-clamp-2 leading-snug">
          {recent.name}
        </p>
      </div>
      {onPlay && (
        <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
          <div className="size-10 rounded-full btn-brand grid place-items-center">
            <Play className="size-4 fill-white ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block min-w-0">
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onPlay} className="block w-full min-w-0 text-left">
      {inner}
    </button>
  );
}
