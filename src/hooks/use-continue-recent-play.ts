"use client";

import {
  buildPlayerSourceFromRecent,
  computeContinueProgressPct,
  continueDetailHref,
  recentResumeStorageKey,
} from "@/lib/continue-watching";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
  stubLiveStreamFromRecent,
} from "@/lib/live-flip-playlist";
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
  liveFlipStreams?: RecentItem[]
) {
  const router = useRouter();
  const accountKey = useMemo(() => browseAccountKey(creds), [creds]);
  const vodResumeSec = usePrefs((s) => s.vodResumeSec);

  const playRecent = useCallback(
    (recent: RecentItem) => {
      if (recent.kind === "live") {
        const stream = stubLiveStreamFromRecent(recent);
        const flipSource = liveFlipStreams ?? recents.filter((r) => r.kind === "live");
        const flipStreams = flipSource.map(stubLiveStreamFromRecent);
        play(liveStreamToPlayerSource(creds, stream), {
          playlist: buildLiveFlipPlaylist(
            creds,
            flipStreams.length > 1 ? flipStreams : [stream]
          ),
        });
        addRecent(recent);
        return;
      }

      const source = buildPlayerSourceFromRecent(creds, recent);
      if (source) {
        play(source);
        addRecent(recent);
        return;
      }

      const href = continueDetailHref(recent);
      if (href) router.push(href);
    },
    [creds, recents, liveFlipStreams, play, addRecent, router]
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
