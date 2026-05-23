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
  { href: "/app/favorites", label: "Favorites", icon: Heart },
  { href: "/app/search", label: "Search", icon: Search },
  { href: "/app/tv", label: "TV Mode", icon: PanelsTopLeft },
];

/** First four — pinned on mobile bottom navigation */
export const MOBILE_NAV_PRIMARY = APP_NAV.slice(0, 4);

/** Rest — “More” sheet on mobile */
export const MOBILE_NAV_MORE = APP_NAV.slice(4);
