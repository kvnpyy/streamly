"use client";

import { HomeRecentTile } from "@/components/home/HomeRecentTile";
import { SectionHeader } from "@/components/SectionHeader";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { useContinueRecentPlay } from "@/hooks/use-continue-recent-play";
import { continueDetailHref } from "@/lib/continue-watching";
import { recentResumeStorageKey } from "@/lib/continue-watching";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import {
  browseAccountKey,
  usePrefs,
  type RecentItem,
} from "@/store/preferences";
import { SITE_NAME } from "@/lib/site-brand";
import { Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useMemo } from "react";

export default function ContinueWatchingPage() {
  const creds = useAuth((s) => s.creds)!;
  const tv = useTvBrowser();
  const { status: streamStatus } = useSession();
  const streamSignedIn = streamStatus === "authenticated";
  const { play } = usePlayer();
  const recents = usePrefs((s) => s.recents);
  const removeRecent = usePrefs((s) => s.removeRecent);
  const clearRecents = usePrefs((s) => s.clearRecents);
  const isFavorite = usePrefs((s) => s.isFavorite);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const addRecent = usePrefs((s) => s.addRecent);
  const clearVodResume = usePrefs((s) => s.clearVodResume);
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);

  const { playRecent, progressPctFor } = useContinueRecentPlay(
    creds,
    recents,
    play,
    addRecent
  );

  const onRemove = (recent: RecentItem) => {
    removeRecent(recent.kind, recent.id);
    const key = recentResumeStorageKey(accountKey, recent);
    if (key) clearVodResume(key);
  };

  const badgeFor = (r: RecentItem) =>
    r.kind === "live" ? "Live" : r.kind === "movie" ? "Movie" : "Series";

  const grid = (
    <div
      className={
        tv
          ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
          : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
      }
    >
      {recents.map((r) => (
        <div key={`${r.kind}-${r.id}`} className="relative group min-w-0">
          <HomeRecentTile
            recent={r}
            badge={badgeFor(r)}
            onPlay={() => playRecent(r)}
            detailHref={continueDetailHref(r)}
            progressPct={progressPctFor(r)}
            isFavorite={isFavorite(r.kind, r.id)}
            onToggleFavorite={() =>
              toggleFavorite({
                kind: r.kind,
                id: r.id,
                name: r.name,
                icon: r.icon,
                meta: r.meta,
              })
            }
          />
          <button
            type="button"
            aria-label={`Remove ${r.name} from continue watching`}
            onClick={() => onRemove(r)}
            className="absolute bottom-10 right-2 z-10 size-8 rounded-lg bg-black/55 text-white/90 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-black/70 grid place-items-center transition-opacity"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          eyebrow="Pick up where you left off"
          title="Continue watching"
          description="Resume movies, series, and live channels you've watched recently."
        />
        {recents.length > 0 && (
          <button
            type="button"
            onClick={clearRecents}
            className="text-sm text-(--text-dim) hover:text-(--text) border border-(--line) rounded-xl px-3 py-2 hover:bg-(--bg-3) transition-colors shrink-0"
          >
            Clear all
          </button>
        )}
      </div>

      {!streamSignedIn && streamStatus !== "loading" && (
        <div className="rounded-xl border border-(--brand)/25 bg-(--brand)/5 px-4 py-3 text-sm text-(--text-dim) leading-relaxed">
          Continue Watching syncs across your phone and TV when you&apos;re
          signed into {SITE_NAME}. Link this device with a PIN from a signed-in
          phone or computer, or{" "}
          <Link
            href="/login"
            className="text-(--brand-2) underline underline-offset-2 hover:text-(--text)"
          >
            sign in
          </Link>
          .
        </div>
      )}

      {recents.length === 0 ? (
        <div className="card p-12 text-center text-(--text-dim) space-y-3">
          <p className="text-(--text)">Nothing to continue yet</p>
          <p className="text-sm text-(--text-muted) max-w-md mx-auto">
            Start watching Live TV, a movie, or a series — your recent picks will
            show up here.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Link href="/app/live" className="btn-brand px-4 py-2 rounded-xl text-sm">
              Live TV
            </Link>
            <Link
              href="/app/movies"
              className="px-4 py-2 rounded-xl text-sm border border-(--line) hover:bg-(--bg-3)"
            >
              Movies
            </Link>
          </div>
        </div>
      ) : tv ? (
        <TvSpatialGrid>{grid}</TvSpatialGrid>
      ) : (
        grid
      )}
    </div>
  );
}
