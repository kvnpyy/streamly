"use client";

import { HomeRecentTile } from "@/components/home/HomeRecentTile";
import { TvHomeLight } from "@/components/home/TvHomeLight";
import { useContinueRecentPlay } from "@/hooks/use-continue-recent-play";
import {
  FeaturedSpotlightHero,
  playFeaturedSpotlight,
} from "@/components/home/FeaturedSpotlight";
import { CONTINUE_WATCHING_PATH, continueDetailHref } from "@/lib/continue-watching";
import { pickFeaturedSpotlight } from "@/lib/featured-spotlight";
import { MY_LIST_LABEL } from "@/lib/my-list";
import { browseAccountKey } from "@/store/preferences";
import { welcomeDisplayName } from "@/lib/welcome-display-name";
import { useLivingRoomHomeLayout } from "@/lib/use-living-room-home-layout";
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
import { ChevronRight } from "lucide-react";
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
  const vodResumeSec = usePrefs((s) => s.vodResumeSec);
  const favorites = usePrefs((s) => s.favorites);
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);
  const spotlight = useMemo(
    () => pickFeaturedSpotlight(recents, accountKey, vodResumeSec),
    [recents, accountKey, vodResumeSec]
  );
  const spotlightRecent = useMemo(
    () =>
      spotlight
        ? recents.find(
            (r) => r.kind === spotlight.kind && r.id === spotlight.id
          )
        : undefined,
    [recents, spotlight]
  );
  const hideAdult = usePrefs((s) => s.hideAdult);
  const parentalUnlocked = usePrefs((s) => s.parentalUnlocked);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const isFavorite = usePrefs((s) => s.isFavorite);
  const addRecent = usePrefs((s) => s.addRecent);

  const recentSlice = useMemo(() => recents.slice(0, 6), [recents]);
  const { playRecent, progressPctFor } = useContinueRecentPlay(
    creds,
    recents,
    play,
    addRecent
  );

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
      {spotlight && spotlightRecent ? (
        <FeaturedSpotlightHero
          spotlight={spotlight}
          creds={creds}
          recent={spotlightRecent}
          onPlay={() =>
            void playFeaturedSpotlight(
              spotlight,
              creds,
              spotlightRecent,
              play,
              addRecent
            )
          }
        />
      ) : (
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
            Jump into Live TV, Movies, or Series — full catalogs load on those
            pages so this home screen stays fast.
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
      )}

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
          label={MY_LIST_LABEL}
          accent="text-(--danger)"
          detail={favorites.length > 0 ? String(favorites.length) : undefined}
        />
      </div>

      {recentSlice.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
                Pick up where you left off
              </p>
              <h2 className="text-base font-bold text-(--text) leading-tight">
                Continue watching
              </h2>
            </div>
            <Link
              href={CONTINUE_WATCHING_PATH}
              className="flex items-center gap-0.5 text-xs text-(--text-dim) hover:text-(--text) transition-colors shrink-0"
            >
              See all
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {recentSlice.map((r) => (
              <div
                key={r.kind === "live" ? `live-${r.id}` : `${r.kind}-${r.id}`}
                className="shrink-0 w-28 sm:w-32"
              >
                <HomeRecentTile
                  recent={r}
                  badge={
                    r.kind === "live"
                      ? "Live"
                      : r.kind === "movie"
                        ? "Movie"
                        : "Series"
                  }
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
              </div>
            ))}
          </div>
        </section>
      )}

      {showRichPrompt && (
        <section className="card p-6 sm:p-8 text-center space-y-3">
          <p className="text-sm text-(--text-muted) max-w-md mx-auto text-pretty">
            Movie and series recommendations load automatically in a moment when
            your device is ready. You can also load them now, or browse Movies
            and Series directly.
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
