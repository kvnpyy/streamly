"use client";

import { tvRouteLabel } from "@/lib/tv-route-label";
import { cn } from "@/lib/utils";
import { ArrowLeft, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

type TvSubNavProps = {
  title?: string;
  backHref?: string;
  className?: string;
};

/** Lightweight top bar for TV sub-pages — Home back + title + Settings. */
export function TvSubNav({
  title,
  backHref = "/app",
  className,
}: TvSubNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const label = title ?? tvRouteLabel(pathname);

  const warmHome = useCallback(() => {
    router.prefetch(backHref);
  }, [router, backHref]);

  return (
    <nav className={cn("tv-sub-nav", className)} aria-label="Page navigation">
      <Link
        href={backHref}
        prefetch
        data-tv-card-root
        onFocus={warmHome}
        onPointerEnter={warmHome}
        className="tv-sub-nav__back focus-ring"
      >
        <ArrowLeft className="size-6 shrink-0" aria-hidden />
        <span>Home</span>
      </Link>
      <h1 className="tv-sub-nav__title">{label}</h1>
      <Link
        href="/app/settings"
        data-tv-card-root
        className="tv-sub-nav__settings focus-ring"
        aria-label="Settings"
      >
        <Settings className="size-6" aria-hidden />
      </Link>
    </nav>
  );
}
