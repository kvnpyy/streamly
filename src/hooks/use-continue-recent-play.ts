"use client";

import {
  resolveMoviePlayerSourceFromRecent,
  resolvePlayerSourceFromRecent,
  computeContinueProgressPct,
  continueDetailHref,
  recentResumeStorageKey,
} from "@/lib/continue-watching";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
  stubLiveStreamFromRecent,
} from "@/lib/live-flip-playlist";
import {
  liveRecentFlipStreams,
} from "@/lib/live-recent-streams";
import type { LiveStream } from "@/lib/xtream-types";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { PlayerPlaylist } from "@/store/player";
import type { PlayerSource } from "@/store/player";
import {
  browseAccountKey,
  type RecentItem,
  usePrefs,
} from "@/store/preferences";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

type PlayFn = (
  source: PlayerSource,
  opts?: { playlist?: PlayerPlaylist }
) => void;

export function useContinueRecentPlay(
  creds: XtreamCredentials,
  recents: RecentItem[],
  play: PlayFn,
  addRecent: (item: Omit<RecentItem, "lastAt" | "addedAt">) => void,
  liveFlipStreams?: RecentItem[],
  liveFlipCatalog?: LiveStream[]
) {
  const router = useRouter();
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);
  const vodResumeSec = usePrefs((s) => s.vodResumeSec);

  const playRecent = useCallback(
    (recent: RecentItem) => {
      if (recent.kind === "live") {
        const stream = stubLiveStreamFromRecent(recent);
        const flipFromCatalog = liveFlipCatalog?.length
          ? liveRecentFlipStreams(stream, liveFlipCatalog, recents)
          : null;
        const flipSource = liveFlipStreams ?? recents.filter((r) => r.kind === "live");
        const flipStreams = flipFromCatalog
          ? flipFromCatalog
          : flipSource.map(stubLiveStreamFromRecent);
        play(liveStreamToPlayerSource(creds, stream), {
          playlist: buildLiveFlipPlaylist(
            creds,
            flipStreams.length > 1 ? flipStreams : [stream]
          ),
        });
        addRecent(recent);
        return;
      }

      void (async () => {
        const source = await resolvePlayerSourceFromRecent(creds, recent);
        if (source) {
          play(source);
          addRecent(recent);
          return;
        }

        if (recent.kind === "movie") {
          play(await resolveMoviePlayerSourceFromRecent(creds, recent));
          addRecent(recent);
          return;
        }

        const href = continueDetailHref(recent);
        if (href) router.push(href);
      })();
    },
    [creds, recents, liveFlipStreams, liveFlipCatalog, play, addRecent, router]
  );

  const progressPctFor = useCallback(
    (recent: RecentItem): number | null => {
      if (recent.kind === "live") return null;
      const key = recentResumeStorageKey(accountKey, recent);
      const resumeSec = key ? vodResumeSec[key] : undefined;
      const durationSec =
        typeof recent.meta?.durationSec === "number"
          ? recent.meta.durationSec
          : undefined;
      return computeContinueProgressPct(resumeSec, durationSec);
    },
    [accountKey, vodResumeSec]
  );

  return { playRecent, progressPctFor };
}
