"use client";

import { useTvBrowser } from "@/components/TvBrowserProvider";
import { useTmdbArtwork } from "@/hooks/use-tmdb-artwork";
import { proxiedCssBackground } from "@/lib/image-proxy";
import { cn } from "@/lib/utils";
import { Heart } from "lucide-react";
import Link from "next/link";

type ChannelArtworkCardProps = {
  channelName: string;
  icon?: string;
  panelServer: string;
  programmeTitle?: string;
  subtitle?: string;
  badge?: string;
  href?: string;
  onClick?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  className?: string;
  /** 16:9 for TV shelves; 2:3 for discovery poster rows. */
  aspect?: "video" | "poster";
};

function titleInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Live channel card: panel logo (proxied) + optional TMDB art for the on-air programme.
 */
export function ChannelArtworkCard({
  channelName,
  icon,
  panelServer,
  programmeTitle,
  subtitle,
  badge,
  href,
  onClick,
  isFavorite,
  onToggleFavorite,
  className,
  aspect = "poster",
}: ChannelArtworkCardProps) {
  const tv = useTvBrowser();
  const cardAspect = aspect === "poster" && tv ? "video" : aspect;
  const iconBg = proxiedCssBackground(icon, panelServer);
  const artworkUrl = useTmdbArtwork(programmeTitle?.trim() || undefined);
  const initials = titleInitials(channelName);

  const inner = (
    <div
      className={cn(
        "group relative card overflow-hidden hover:border-(--line-2) transition-all hover:-translate-y-0.5",
        tv && "focus-within:ring-2 focus-within:ring-(--brand-2)/70",
        className
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden",
          cardAspect === "video" ? "aspect-video" : "aspect-[2/3]"
        )}
      >
        <div className="absolute inset-0 bg-(--bg-3)" />
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <span
            className={cn(
              "font-semibold select-none text-(--text-dim)/40",
              cardAspect === "video" ? "text-xl" : "text-2xl"
            )}
          >
            {initials}
          </span>
        </div>
        {iconBg && (
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              backgroundImage: iconBg,
              backgroundSize: "contain",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundOrigin: "content-box",
              padding: cardAspect === "video" ? "12px" : "16px",
              opacity: artworkUrl ? 0.35 : 1,
            }}
          />
        )}
        {artworkUrl && (
          <div
            className="absolute inset-0 transition-opacity duration-500"
            style={{
              backgroundImage: `url("${artworkUrl}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        {artworkUrl && (
          <div
            className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)",
            }}
          />
        )}
        {badge && (
          <span className="absolute top-2 left-2 z-10 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-(--danger)/90 text-white">
            {badge}
          </span>
        )}
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={cn(
              "absolute top-2 right-2 z-10 size-8 rounded-full grid place-items-center transition-colors",
              isFavorite
                ? "bg-(--danger)/90 text-white"
                : "bg-black/50 text-white/80 hover:text-white"
            )}
            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
          >
            <Heart className={cn("size-4", isFavorite && "fill-current")} />
          </button>
        )}
      </div>
      <div className={cn("space-y-0.5", tv ? "p-3" : "p-2.5")}>
        <p
          className={cn(
            "font-semibold text-(--text) line-clamp-2 leading-snug",
            tv ? "text-base sm:text-lg" : "text-sm"
          )}
        >
          {channelName}
        </p>
        {subtitle && (
          <p
            className={cn(
              "text-(--text-dim) line-clamp-2 leading-snug",
              tv ? "text-xs sm:text-sm" : "text-[11px]"
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );

  const focusProps = tv
    ? ({
        tabIndex: 0,
        "data-tv-card-root": true,
        className:
          "block w-full text-left rounded-xl focus-ring outline-offset-4",
      } as const)
    : ({
        className:
          "block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50 rounded-xl",
      } as const);

  if (href) {
    return (
      <Link href={href} {...focusProps}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} {...focusProps}>
      {inner}
    </button>
  );
}
