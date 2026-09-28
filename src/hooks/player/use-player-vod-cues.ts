"use client";

import type { ParsedVodChapters } from "@/lib/vod-chapter-markers";
import { loadVodMarkerDb, saveVodMarkerDb } from "@/lib/vod-marker-memory";
import {
  applyChapterMarkers,
  applyLearnedIntro,
  episodeMarkerKey,
  introSpanFromManualSeek,
  resolveCreditsStartSec,
  resolveIntroSpan,
  showMarkerKey,
  skipIntroCue,
  type MarkerIdentity,
  type SkipIntroCue,
  type VodIntroSpan,
  type VodMarkerDb,
} from "@/lib/vod-playback-markers";
import type { PlayerSource } from "@/store/player";
import { useCallback, useMemo, useState } from "react";

export type UsePlayerVodCuesParams = {
  open: boolean;
  current: PlayerSource | null;
  timeSec: number;
  /** Probed or catalog title length — not the growing transcode media clock. */
  titleDurationSec: number;
  seeking: boolean;
  chapterMarkers: ParsedVodChapters | null;
};

export type UsePlayerVodCuesResult = {
  skipIntro: SkipIntroCue | null;
  creditsStartSec: number | null;
  /** Chapter mark or a credit length learned from this show — safe to count down immediately. */
  creditsExact: boolean;
  introKnown: boolean;
  introEndSec: number | null;
  dismissSkipIntro: () => void;
  rememberIntro: (span: VodIntroSpan) => void;
  rememberManualSeek: (fromSec: number, toSec: number) => void;
};

function identityOf(current: PlayerSource): MarkerIdentity {
  return {
    kind: current.kind,
    id: current.id,
    streamId: current.streamId,
    title: current.title,
  };
}

export function usePlayerVodCues(p: UsePlayerVodCuesParams): UsePlayerVodCuesResult {
  const { open, current, timeSec, titleDurationSec, seeking, chapterMarkers } =
    p;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const episodeKey = current
    ? `${current.kind}:${current.id}:${current.streamId ?? ""}:${current.url}`
    : null;

  const [db, setDb] = useState<VodMarkerDb>(() => loadVodMarkerDb());
  const [dbEpisode, setDbEpisode] = useState(episodeKey);
  const [appliedMarkerSig, setAppliedMarkerSig] = useState("");
  if (episodeKey !== dbEpisode) {
    setDbEpisode(episodeKey);
    setDb(loadVodMarkerDb());
    setAppliedMarkerSig("");
  }

  const markerSig =
    chapterMarkers == null
      ? ""
      : `${chapterMarkers.intro?.startSec ?? ""}-${chapterMarkers.intro?.endSec ?? ""}-${chapterMarkers.intro?.kind ?? ""}-${chapterMarkers.creditsStartSec ?? ""}-${titleDurationSec}`;
  if (
    open &&
    current &&
    current.kind !== "live" &&
    chapterMarkers &&
    markerSig !== appliedMarkerSig
  ) {
    const next = applyChapterMarkers(
      db,
      identityOf(current),
      chapterMarkers,
      titleDurationSec
    );
    saveVodMarkerDb(next);
    setAppliedMarkerSig(markerSig);
    setDb(next);
  }

  const identity = useMemo(
    () => (current && current.kind !== "live" ? identityOf(current) : null),
    [current]
  );
  const intro = useMemo(
    () => (identity ? resolveIntroSpan(db, identity) : null),
    [db, identity]
  );

  const credits = useMemo(() => {
    if (!identity || current?.kind !== "series") {
      return { startSec: null as number | null, exact: false };
    }
    const showKey = showMarkerKey(identity);
    const episode = db.episodes[episodeMarkerKey(identity)];
    const show = showKey ? db.shows[showKey] : undefined;
    return {
      startSec: resolveCreditsStartSec({
        durationSec: titleDurationSec,
        episodeCreditsStartSec: episode?.creditsStartSec,
        showCreditsFromEndSec: show?.creditsFromEndSec,
      }),
      exact:
        episode?.creditsSource === "chapter" ||
        show?.creditsSource === "chapter",
    };
  }, [identity, current?.kind, db, titleDurationSec]);

  const dismissed = episodeKey != null && dismissedKey === episodeKey;
  const skipIntro = skipIntroCue({
    timeSec,
    span: intro,
    dismissed,
    seeking,
  });

  const persist = useCallback((next: VodMarkerDb) => {
    saveVodMarkerDb(next);
    setDb(next);
  }, []);

  const rememberIntro = useCallback(
    (span: VodIntroSpan) => {
      if (!current || current.kind === "live") return;
      persist(applyLearnedIntro(db, identityOf(current), span));
    },
    [current, db, persist]
  );

  const rememberManualSeek = useCallback(
    (fromSec: number, toSec: number) => {
      if (!current || current.kind === "live" || intro) return;
      const span = introSpanFromManualSeek(fromSec, toSec);
      if (!span) return;
      persist(applyLearnedIntro(db, identityOf(current), span));
    },
    [current, db, intro, persist]
  );

  const dismissSkipIntro = useCallback(() => {
    if (episodeKey) setDismissedKey(episodeKey);
  }, [episodeKey]);

  return {
    skipIntro: open ? skipIntro : null,
    creditsStartSec: open ? credits.startSec : null,
    creditsExact: open ? credits.exact : false,
    introEndSec: open && intro ? intro.endSec : null,
    introKnown: intro != null,
    dismissSkipIntro,
    rememberIntro,
    rememberManualSeek,
  };
}
