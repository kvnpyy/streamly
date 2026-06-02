"use client";

import { HomeRecentTile } from "@/components/home/HomeRecentTile";
import { TvHomeLight } from "@/components/home/TvHomeLight";
import { SectionHeader } from "@/components/SectionHeader";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { welcomeDisplayName } from "@/lib/welcome-display-name";
import { useLivingRoomHomeLayout } from "@/lib/use-living-room-home-layout";
import { buildLivePlayUrl } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import {
  Clapperboard,
  PlaySquare,
  Radio,
  Sparkles,
  Tv,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMemo } from "react";

type HomePageLightProps = {
  creds: XtreamCredentials;
  showRichPrompt: boolean;
  onLoadRich: () => void;
};

export function HomePageLight({
  creds,
  showRichPrompt,
  onLoadRich,
}: HomePageLightProps) {
  const { data: streamSession } = useSession();
  const account = useAuth((s) => s.account);
  const greetingName = welcomeDisplayName({
    streamName: streamSession?.user?.name,
    streamEmail: streamSession?.user?.email,
    iptvUsername: account?.user_info.username || creds.username,
  });
  const { play } = usePlayer();
  const livingRoomHome = useLivingRoomHomeLayout();
  const recents = usePrefs((s) => s.recents);
  const favorites = usePrefs((s) => s.favorites);
  const hideAdult = usePrefs((s) => s.hideAdult);
  const parentalUnlocked = usePrefs((s) => s.parentalUnlocked);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const isFavorite = usePrefs((s) => s.isFavorite);
  const addRecent = usePrefs((s) => s.addRecent);

  const recentSlice = useMemo(() => recents.slice(0, 12), [recents]);

  if (livingRoomHome) {
    return (
      <TvHomeLight
        greetingName={greetingName}
        creds={creds}
        recents={recents}
        favorites={favorites}
        hideAdult={hideAdult}
        parentalUnlocked={parentalUnlocked}
        play={play}
        addRecent={addRecent}
        isFavorite={isFavorite}
        toggleFavorite={toggleFavorite}
        showRichPrompt={showRichPrompt}
        onLoadRich={onLoadRich}
      />
    );
  }

  return (
    <div className="space-y-10">
      <header className="relative overflow-hidden card p-6 sm:p-10">
        <div className="absolute inset-0 -z-10 opacity-80">
          <div className="absolute -top-20 -right-10 size-72 bg-(--brand)/30 blur-[80px] rounded-full" />
          <div className="absolute -bottom-20 -left-10 size-72 bg-(--brand-2)/15 blur-[80px] rounded-full" />
        </div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-(--brand-2) mb-2 flex items-center gap-2">
          <Radio className="size-3.5" /> Welcome back
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Hey {greetingName}, what are we watching?
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
        <QuickLink
          href="/app/live"
          icon={<Tv className="size-4" />}
          label="Live TV"
          accent="text-(--brand-2)"
        />
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
          label="Favorites"
          accent="text-(--danger)"
          detail={favorites.length > 0 ? String(favorites.length) : undefined}
        />
      </div>

      {recentSlice.length > 0 && (
        <section>
          <SectionHeader
            eyebrow="Pick up where you left off"
            title="Continue watching"
          />
          <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {recentSlice.map((r) =>
              r.kind === "live" ? (
                <HomeRecentTile
                  key={`live-${r.id}`}
                  recent={r}
                  badge="Live"
                  isFavorite={isFavorite("live", r.id)}
                  onToggleFavorite={() =>
                    toggleFavorite({
                      kind: "live",
                      id: r.id,
                      name: r.name,
                      icon: r.icon,
                    })
                  }
                  onPlay={() => {
                    play({
                      kind: "live",
                      id: r.id,
                      title: r.name,
                      poster: r.icon,
                      url: buildLivePlayUrl(creds, {
                        stream_id: r.id,
                        direct_source:
                          typeof r.meta?.direct_source === "string"
                            ? r.meta.direct_source
                            : undefined,
                      }),
                    });
                    addRecent(r);
                  }}
                />
              ) : (
                <HomeRecentTile
                  key={`${r.kind}-${r.id}`}
                  recent={r}
                  badge={r.kind === "movie" ? "Movie" : "Series"}
                  href={
                    r.kind === "movie"
                      ? `/app/movies/${r.id}`
                      : `/app/series/${r.id}`
                  }
                  isFavorite={isFavorite(r.kind, r.id)}
                  onToggleFavorite={() =>
                    toggleFavorite({
                      kind: r.kind,
                      id: r.id,
                      name: r.name,
                      icon: r.icon,
                    })
                  }
                />
              )
            )}
          </TvSpatialGrid>
        </section>
      )}

      {showRichPrompt && (
        <section className="card p-6 sm:p-8 text-center space-y-3">
          <p className="text-sm text-(--text-muted) max-w-md mx-auto text-pretty">
            Movie and series recommendations can load your full catalog and may
            slow down weaker devices. Browse Movies or Series directly, or load
            shelves here.
          </p>
          <button
            type="button"
            onClick={onLoadRich}
            className="inline-flex items-center justify-center h-10 px-5 rounded-xl btn-brand text-sm font-medium"
          >
            Load recommendations on home
          </button>
        </section>
      )}
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  accent,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  accent: string;
  detail?: string;
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
        <div className="text-lg font-semibold">{detail ?? "Browse"}</div>
      </div>
    </Link>
  );
}
