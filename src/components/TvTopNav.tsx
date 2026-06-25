"use client";

import { BrandMark } from "@/components/BrandMark";
import { PlaylistSwitcher } from "@/components/PlaylistSwitcher";
import { APP_NAV } from "@/lib/nav-config";
import { SITE_NAME } from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import { Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** TV nav excludes the "TV Mode" redirect shortcut — it's only for desktop. */
const TV_NAV_ITEMS = APP_NAV.filter((n) => n.href !== "/app/tv");

/**
 * Full-width sticky top navigation for TV-class browsers.
 * Replaces the left sidebar entirely so content fills the whole screen.
 */
export function TvTopNav() {
  const pathname = usePathname();
  const onSearchPage = pathname.startsWith("/app/search");

  return (
    <nav
      className="sticky top-0 z-40 w-full"
      style={{
        background:
          "linear-gradient(to bottom, rgba(10,12,18,0.97) 0%, rgba(10,12,18,0.85) 100%)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div className="flex items-center gap-1 px-4 sm:px-6 py-2.5 max-w-[1800px] mx-auto overflow-x-auto scrollbar-none">
        {/* Logo */}
        <Link
          href="/app"
          data-tv-card-root
          className="flex items-center gap-2.5 mr-4 shrink-0 rounded-xl px-2 py-1.5 text-(--text) hover:bg-(--bg-2)/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55"
          title={SITE_NAME}
        >
          <BrandMark size={8} />
          <span className="font-bold text-sm tracking-tight">
            {SITE_NAME}
          </span>
        </Link>

        {/* Primary nav items */}
        {TV_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              data-tv-card-root
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm sm:text-base font-medium transition-all min-h-11",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55 focus-visible:ring-offset-1 focus-visible:ring-offset-(--bg-0)",
                active
                  ? "bg-(--brand)/18 text-(--text)"
                  : "text-(--text-dim) hover:text-(--text) hover:bg-(--bg-2)/60"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-(--brand)" : "text-(--text-muted)"
                )}
              />
              <span>{label}</span>
            </Link>
          );
        })}

        {/* Right side: playlist switcher + settings */}
        <div className="ml-auto flex items-center gap-1.5">
          {!onSearchPage && (
            <Link
              href="/app/search"
              data-tv-card-root
              title="Search"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-(--text-dim) hover:text-(--text) hover:bg-(--bg-2)/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55"
            >
              <Search className="size-4 shrink-0" />
              <span className="hidden sm:inline">Search</span>
            </Link>
          )}
          <PlaylistSwitcher className="hidden sm:flex shrink-0" />
          <Link
            href="/app/settings"
            data-tv-card-root
            title="Settings"
            className="flex items-center justify-center size-9 rounded-xl text-(--text-muted) hover:text-(--text) hover:bg-(--bg-2)/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55"
          >
            <Settings className="size-4" />
          </Link>
        </div>
      </div>
    </nav>
  );
}
