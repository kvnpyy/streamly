"use client";

import { cn } from "@/lib/utils";
import { buildImageProxy } from "@/lib/xtream";
import { Heart, Play, Star } from "lucide-react";
import Link from "next/link";

/** Deterministic 0–359 hue from a string. */
function titleHue(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (h * 31 + title.charCodeAt(i)) & 0xffff;
  }
  return h % 360;
}

/** Up to 2 initials from the first two words. */
function titleInitials(title: string): string {
  const words = title
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export type MediaCardProps = {
  href?: string;
  onClick?: () => void;
  poster?: string;
  title: string;
  subtitle?: string;
  rating?: string | number;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  badge?: string;
  className?: string;
  /**
   * How to fit the poster image.
   * "cover" (default) fills the card — good for movie posters.
   * "contain" keeps aspect ratio with padding — good for channel logos.
   */
  posterFit?: "cover" | "contain";
};

export function MediaCard({
  href,
  onClick,
  poster,
  title,
  subtitle,
  rating,
  isFavorite,
  onToggleFavorite,
  badge,
  className,
  posterFit = "cover",
}: MediaCardProps) {
  const ratingNum =
    typeof rating === "number"
      ? rating
      : rating
        ? parseFloat(rating)
        : undefined;

  const hue = titleHue(title);
  const initials = titleInitials(title);

  const inner = (
    <div
      className={cn(
        "group relative card overflow-hidden hover:border-(--line-2) transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(124,92,255,0.6)]",
        className
      )}
    >
      <div className="relative aspect-[2/3] overflow-hidden">
        {/* Layer 1: deterministic gradient background — always visible, acts as fallback */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(145deg, hsl(${hue},35%,18%) 0%, hsl(${(hue + 60) % 360},25%,12%) 100%)`,
          }}
        />

        {/* Layer 2: initials fallback text — visible whenever the poster doesn't cover */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <span
            className="text-3xl font-bold select-none"
            style={{ color: `hsl(${hue},50%,65%)` }}
          >
            {initials}
          </span>
        </div>

        {/* Layer 3: poster via CSS background-image — silently skipped on error, no red boxes */}
        {poster && (
          <div
            className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]"
            style={{
              backgroundImage: `url("${buildImageProxy(poster)}")`,
              backgroundSize: posterFit === "contain" ? "contain" : "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/0 to-black/0 opacity-90" />

        {/* badges */}
        <div className="absolute top-2 left-2 flex gap-1.5">
          {badge && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-black/55 backdrop-blur border border-white/10 text-white">
              {badge}
            </span>
          )}
          {ratingNum !== undefined && ratingNum > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-black/55 backdrop-blur border border-white/10 text-amber-300">
              <Star className="size-3 fill-amber-300" />
              {ratingNum.toFixed(1)}
            </span>
          )}
        </div>

        {onToggleFavorite && (
          <button
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={cn(
              "absolute top-2 right-2 size-8 grid place-items-center rounded-lg backdrop-blur transition-colors",
              isFavorite
                ? "bg-(--danger)/90 text-white"
                : "bg-black/45 text-white/80 hover:bg-black/70"
            )}
          >
            <Heart
              className={cn("size-4", isFavorite && "fill-white")}
            />
          </button>
        )}

        <div className="absolute inset-x-0 bottom-0 p-3 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all">
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg btn-brand">
            <Play className="size-3.5 fill-white" /> Watch
          </span>
        </div>
      </div>
      <div className="p-3">
        <div className="text-sm font-medium text-(--text) line-clamp-1">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-(--text-muted) line-clamp-1 mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        data-tv-card-root
        className="block focus-ring rounded-2xl [&:focus-visible]:relative [&:focus-visible]:z-[1]"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      data-tv-card-root
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="block w-full text-left focus-ring rounded-2xl cursor-pointer [&:focus-visible]:relative [&:focus-visible]:z-[1]"
    >
      {inner}
    </div>
  );
}
