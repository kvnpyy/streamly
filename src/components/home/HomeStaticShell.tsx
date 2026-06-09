"use client";

import { Clapperboard, PlaySquare, Radio, Sparkles, Tv } from "lucide-react";
import Link from "next/link";

/** Zero-data shell for Library — paints instantly without prefs or catalog hooks. */
export function HomeStaticShell() {
  return (
    <div className="space-y-10" aria-busy="true">
      <header className="relative overflow-hidden card p-6 sm:p-10">
        <div className="absolute inset-0 -z-10 opacity-80">
          <div className="absolute -top-20 -right-10 size-72 bg-(--brand)/30 blur-[80px] rounded-full" />
          <div className="absolute -bottom-20 -left-10 size-72 bg-(--brand-2)/15 blur-[80px] rounded-full" />
        </div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-(--brand-2) mb-2 flex items-center gap-2">
          <Radio className="size-3.5" /> Welcome back
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Your library
        </h1>
        <p className="text-(--text-dim) mt-2 max-w-xl">
          Jump into Live TV, Movies, or Series — full catalogs load on those pages
          so this home screen stays fast.
        </p>
        <div className="flex flex-wrap gap-2 mt-5">
          <Link
            href="/app/live"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl btn-brand text-sm font-medium"
          >
            <Tv className="size-4" /> Live TV
          </Link>
          <Link
            href="/app/movies"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-sm border border-white/10 transition-colors"
          >
            <Clapperboard className="size-4" /> Movies
          </Link>
          <Link
            href="/app/series"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-sm border border-white/10 transition-colors"
          >
            <PlaySquare className="size-4" /> Series
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink href="/app/live" icon={<Tv className="size-4" />} label="Live TV" accent="text-(--brand-2)" />
        <QuickLink
          href="/app/movies"
          icon={<Clapperboard className="size-4" />}
          label="Movies"
          accent="text-(--brand)"
        />
        <QuickLink
          href="/app/series"
          icon={<PlaySquare className="size-4" />}
          label="Series"
          accent="text-amber-300"
        />
        <QuickLink
          href="/app/favorites"
          icon={<Sparkles className="size-4" />}
          label="My List"
          accent="text-(--danger)"
        />
      </div>

      <div className="card p-8 flex items-center justify-center gap-3 text-sm text-(--text-muted)">
        <div className="size-5 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin shrink-0" />
        Loading your shortcuts…
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="card p-4 hover:border-(--line-2) hover:bg-(--bg-3)/60 transition-colors flex items-center gap-3"
    >
      <div
        className={`size-9 rounded-lg bg-white/5 grid place-items-center ${accent}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-(--text-muted)">{label}</div>
        <div className="text-lg font-semibold">Browse</div>
      </div>
    </Link>
  );
}
