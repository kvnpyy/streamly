import type { LucideIcon } from "lucide-react";
import {
  Clapperboard,
  Compass,
  Heart,
  PanelsTopLeft,
  PlaySquare,
  Search,
  Tv,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Primary app routes — sidebar + mobile bottom bar share this list */
export const APP_NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: Compass },
  { href: "/app/live", label: "Live TV", icon: Tv },
  { href: "/app/movies", label: "Movies", icon: Clapperboard },
  { href: "/app/series", label: "Series", icon: PlaySquare },
  { href: "/app/favorites", label: "My List", icon: Heart },
  { href: "/app/search", label: "Search", icon: Search },
  { href: "/app/tv", label: "TV Mode", icon: PanelsTopLeft },
];

/** Pinned on mobile bottom navigation — Search promoted for quick discovery. */
export const MOBILE_NAV_PRIMARY: NavItem[] = [
  APP_NAV[0]!,
  APP_NAV[1]!,
  APP_NAV[2]!,
  APP_NAV[5]!,
];

/** Living-room top bar — core browse only (My List + Search live in the tool cluster). */
export const TV_TOP_NAV_CORE: NavItem[] = [
  APP_NAV[0]!,
  APP_NAV[1]!,
  APP_NAV[2]!,
  APP_NAV[3]!,
];

/** Icon shortcuts on the right of the TV top bar (always visible). */
export const TV_TOP_NAV_TOOLS: NavItem[] = [
  APP_NAV[4]!,
  APP_NAV[5]!,
];

/** Rest — “More” sheet on mobile */
export const MOBILE_NAV_MORE: NavItem[] = [
  APP_NAV[3]!,
  APP_NAV[4]!,
  APP_NAV[6]!,
];
