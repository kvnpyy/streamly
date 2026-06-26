"use client";

import { SITE_NAME } from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import {
  Clapperboard,
  PlaySquare,
  Settings,
  Tv,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { TvFocusRoot } from "@/components/tv/TvFocusRoot";

type HubTile = {
  href: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
};

const HUB_TILES: HubTile[] = [
  {
    href: "/app/live",
    label: "Live TV",
    subtitle: "Guide & channels",
    icon: Tv,
    accent: "tv-hub-tile--live",
  },
  {
    href: "/app/series",
    label: "TV Series",
    subtitle: "Discover & browse",
    icon: PlaySquare,
    accent: "tv-hub-tile--series",
  },
  {
    href: "/app/movies",
    label: "Movies",
    subtitle: "Discover & browse",
    icon: Clapperboard,
    accent: "tv-hub-tile--movies",
  },
  {
    href: "/app/settings",
    label: "Settings",
    subtitle: "Playlist & account",
    icon: Settings,
    accent: "tv-hub-tile--settings",
  },
];

/** Minimal TV home — four large targets, zero catalog work on mount. */
export function TvMainHub() {
  return (
    <TvFocusRoot className="tv-main-hub">
      <header className="tv-main-hub__brand">
        <h1 className="tv-main-hub__title">{SITE_NAME}</h1>
        <p className="tv-main-hub__subtitle">Pick what to watch</p>
      </header>
      <nav className="tv-main-hub__grid" aria-label="Main menu">
        {HUB_TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            data-tv-card-root
            className={cn("tv-hub-tile focus-ring", tile.accent)}
          >
            <tile.icon className="tv-hub-tile__icon" aria-hidden />
            <span className="tv-hub-tile__label">{tile.label}</span>
            <span className="tv-hub-tile__hint">{tile.subtitle}</span>
          </Link>
        ))}
      </nav>
    </TvFocusRoot>
  );
}
