import { MY_LIST_LABEL } from "@/lib/my-list";
import type { LucideIcon } from "lucide-react";
import { Clapperboard, Heart, PlaySquare, Tv } from "lucide-react";

export type TvHomeDestination = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Living-room home pills. My List is a destination, not only a Live TV shelf. */
export const TV_HOME_QUICK_NAV: readonly TvHomeDestination[] = [
  { href: "/app/live", label: "Live TV", icon: Tv },
  { href: "/app/movies", label: "Movies", icon: Clapperboard },
  { href: "/app/series", label: "Series", icon: PlaySquare },
  { href: "/app/favorites", label: MY_LIST_LABEL, icon: Heart },
];
