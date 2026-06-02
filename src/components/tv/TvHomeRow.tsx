"use client";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type TvHomeRowProps = {
  title: string;
  subtitle?: string;
  seeAllHref?: string;
  children: ReactNode;
  className?: string;
};

/** Consistent 10-foot section chrome for TV home shelves. */
export function TvHomeRow({
  title,
  subtitle,
  seeAllHref,
  children,
  className,
}: TvHomeRowProps) {
  return (
    <section className={cn("tv-home-row", className)} aria-label={title}>
      <div className="tv-home-row__head">
        <div className="min-w-0">
          <h2 className="tv-home-row__title">{title}</h2>
          {subtitle && (
            <p className="tv-home-row__subtitle">{subtitle}</p>
          )}
        </div>
        {seeAllHref && (
          <Link href={seeAllHref} className="tv-home-row__see-all" data-tv-card-root>
            See all
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </Link>
        )}
      </div>
      <div className="tv-home-row__body">{children}</div>
    </section>
  );
}
