"use client";

import { BrandMark } from "@/components/BrandMark";
import { PlaylistSwitcher } from "@/components/PlaylistSwitcher";
import { TV_TOP_NAV_CORE, TV_TOP_NAV_TOOLS } from "@/lib/nav-config";
import { SITE_NAME } from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * TV top navigation — short primary row + pinned account tools so Settings and
 * playlists never scroll off on 1080p TV browsers.
 */
export function TvTopNav() {
  const pathname = usePathname();

  return (
    <nav
      className="tv-top-nav sticky top-0 z-40 w-full"
      style={{
        background:
          "linear-gradient(to bottom, rgba(10,12,18,0.97) 0%, rgba(10,12,18,0.85) 100%)",
      }}
    >
      <div className="tv-top-nav__inner flex items-center gap-2 px-3 sm:px-5 py-2 max-w-[1920px] mx-auto">
        <Link
          href="/app"
          data-tv-card-root
          className="tv-top-nav__logo flex items-center gap-2 shrink-0 rounded-xl px-2 py-1.5 text-(--text) hover:bg-(--bg-2)/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55"
          title={SITE_NAME}
        >
          <BrandMark size={8} />
          <span className="font-bold text-sm tracking-tight hidden min-[1280px]:inline">
            {SITE_NAME}
          </span>
        </Link>

        <div
          className="tv-top-nav__core flex items-center gap-0.5 min-w-0 flex-1 overflow-x-auto scrollbar-hide"
          aria-label="Browse"
        >
          {TV_TOP_NAV_CORE.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/app" ? pathname === "/app" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-tv-card-root
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tv-top-nav__link flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-11 whitespace-nowrap shrink-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55",
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
        </div>

        <div
          className="tv-top-nav__tools flex items-center gap-1 shrink-0 pl-2 border-l border-(--line)"
          aria-label="Library and account"
        >
          {TV_TOP_NAV_TOOLS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-tv-card-root
                title={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tv-top-nav__tool flex items-center justify-center gap-1.5 min-h-11 min-w-11 px-2.5 rounded-xl text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55",
                  active
                    ? "bg-(--brand)/18 text-(--text)"
                    : "text-(--text-dim) hover:text-(--text) hover:bg-(--bg-2)/60"
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="hidden min-[1400px]:inline">{label}</span>
              </Link>
            );
          })}
          <PlaylistSwitcher tvNav className="shrink-0" />
          <Link
            href="/app/settings"
            data-tv-card-root
            title="Settings"
            className={cn(
              "tv-top-nav__tool flex items-center gap-1.5 min-h-11 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55",
              pathname.startsWith("/app/settings")
                ? "bg-(--brand)/18 text-(--text)"
                : "text-(--text-dim) hover:text-(--text) hover:bg-(--bg-2)/60"
            )}
          >
            <Settings className="size-4 shrink-0" />
            <span>Settings</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
