"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export function TvHomeQuickNav({
  items,
}: {
  items: Array<{
    href: string;
    label: string;
    icon: LucideIcon;
    accent?: string;
  }>;
}) {
  return (
    <nav className="tv-home-quick-nav" aria-label="Quick destinations">
      {items.map(({ href, label, icon: Icon, accent }) => (
        <Link
          key={href}
          href={href}
          data-tv-card-root
          className={cn("tv-home-quick-nav__pill focus-ring", accent)}
        >
          <Icon className="size-5 shrink-0" aria-hidden />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
