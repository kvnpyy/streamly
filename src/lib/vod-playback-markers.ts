import type { ParsedVodChapters, VodIntroSpan } from "@/lib/vod-chapter-markers";

export type { VodIntroSpan };

/** First-watch credits guess when the file has no chapter mark. */
export const DEFAULT_CREDITS_FROM_END_SEC = 75;

/**
 * Opening window used when a series file has no chapter mark and this show
 * has not been skipped before. Long enough to cover a typical title sequence.
 */
export const DEFAULT_SERIES_INTRO_END_SEC = 90;

/** Ignore credits guesses on clips shorter than a typical episode. */
export const MIN_CUE_TITLE_DURATION_SEC = 8 * 60;

const MAX_STORED_CREDITS_FROM_END_SEC = 300;
const MIN_STORED_CREDITS_FROM_END_SEC = 12;

export type MarkerSource = "chapter" | "learned";

export type StoredIntro = VodIntroSpan & { source: MarkerSource };

export type EpisodeMarkerRecord = {
  intro?: StoredIntro;
  creditsStartSec?: number;
  creditsSource?: MarkerSource;
  updatedAt: number;
};

export type ShowMarkerRecord = {
  intro?: StoredIntro;
  creditsFromEndSec?: number;
  creditsSource?: MarkerSource;
  updatedAt: number;
};

export type VodMarkerDb = {
  episodes: Record<string, EpisodeMarkerRecord>;
  shows: Record<string, ShowMarkerRecord>;
};

export type MarkerIdentity = {
  kind: string;
  id: number;
  streamId?: number;
  title: string;
};

export function emptyVodMarkerDb(): VodMarkerDb {
  return { episodes: {}, shows: {} };
}

export function episodeMarkerKey(source: MarkerIdentity): string {
  const stream = source.streamId ?? source.id;
  return `${source.kind}:${source.id}:${stream}`;
}

export function showMarkerKey(source: MarkerIdentity): string | null {
  const title = source.title.trim().toLowerCase().replace(/\s+/g, " ");
  if (title.length < 2) return null;
  if (source.kind !== "series" && source.kind !== "movie") return null;
  return `${source.kind}:${source.id}:${title}`;
}

/** Full title length for cue timing. Growing transcode clocks are not passed here. */
export function cueTitleDurationSec(titleDurationSec: number): number {
  if (!Number.isFinite(titleDurationSec)) return 0;
  if (titleDurationSec < MIN_CUE_TITLE_DURATION_SEC) return 0;
  if (titleDurationSec >= 86_400) return 0;
  return titleDurationSec;
}

export function creditsFromEndSec(
  durationSec: number,
  creditsStartSec: number
): number | null {
  if (!(durationSec >= MIN_CUE_TITLE_DURATION_SEC)) return null;
  if (!Number.isFinite(creditsStartSec)) return null;
  const fromEnd = durationSec - creditsStartSec;
  if (fromEnd < MIN_STORED_CREDITS_FROM_END_SEC) return null;
  if (fromEnd > MAX_STORED_CREDITS_FROM_END_SEC) return null;
  if (creditsStartSec < durationSec * 0.5) return null;
  return fromEnd;
}

export function resolveCreditsStartSec(opts: {
  durationSec: number;
  episodeCreditsStartSec?: number;
  showCreditsFromEndSec?: number;
}): number | null {
  const dur = cueTitleDurationSec(opts.durationSec);
  if (dur <= 0) return null;
  const exact = opts.episodeCreditsStartSec;
  if (exact != null && Number.isFinite(exact) && exact >= 60 && exact < dur - 5) {
    return exact;
  }
  const fromEnd =
    opts.showCreditsFromEndSec != null &&
    opts.showCreditsFromEndSec >= MIN_STORED_CREDITS_FROM_END_SEC &&
    opts.showCreditsFromEndSec <= MAX_STORED_CREDITS_FROM_END_SEC
      ? opts.showCreditsFromEndSec
      : DEFAULT_CREDITS_FROM_END_SEC;
  const start = dur - fromEnd;
  if (start < dur * 0.5) return null;
  return start;
}

/** Unknown runtimes still get a skip button. Trailers and clips do not. */
export function seriesDefaultIntroAllowed(titleDurationSec: number): boolean {
  if (!(titleDurationSec > 1)) return true;
  return titleDurationSec >= MIN_CUE_TITLE_DURATION_SEC;
}

export function defaultSeriesIntroSpan(): StoredIntro {
  return {
    startSec: 0,
    endSec: DEFAULT_SERIES_INTRO_END_SEC,
    kind: "intro",
    source: "learned",
  };
}

export function resolveIntroSpan(
  db: VodMarkerDb,
  source: MarkerIdentity
): StoredIntro | null {
  const episode = db.episodes[episodeMarkerKey(source)]?.intro;
  if (episode && episode.endSec > episode.startSec + 4) return episode;
  const showKey = showMarkerKey(source);
  const show = showKey ? db.shows[showKey]?.intro : undefined;
  if (show && show.endSec > show.startSec + 4) return show;
  return null;
}

export type SkipIntroCue = {
  label: string;
  targetSec: number;
  span: StoredIntro;
};

export function skipIntroCue(opts: {
  timeSec: number;
  span: StoredIntro | null;
  dismissed: boolean;
  seeking: boolean;
}): SkipIntroCue | null {
  if (!opts.span || opts.dismissed || opts.seeking) return null;
  if (!Number.isFinite(opts.timeSec)) return null;
  const { startSec, endSec, kind } = opts.span;
  if (!(endSec > startSec + 8)) return null;
  if (opts.timeSec < startSec + 0.35) return null;
  if (opts.timeSec >= endSec - 0.6) return null;
  return {
    label: kind === "recap" ? "Skip recap" : "Skip intro",
    targetSec: Math.min(endSec + 0.2, endSec + 1),
    span: opts.span,
  };
}

/**
 * A deliberate forward scrub inside the opening — remember it as this show's intro.
 * Small arrow skips and mid-episode jumps are ignored.
 */
export function introSpanFromManualSeek(
  fromSec: number,
  toSec: number
): VodIntroSpan | null {
  if (!Number.isFinite(fromSec) || !Number.isFinite(toSec)) return null;
  const jump = toSec - fromSec;
  if (fromSec > 4 * 60) return null;
  if (toSec > 5 * 60) return null;
  if (jump < 15 || jump > 200) return null;
  const startSec = fromSec <= 20 ? 0 : fromSec;
  if (toSec - startSec < 8) return null;
  return { startSec, endSec: toSec, kind: "intro" };
}

export function applyChapterMarkers(
  db: VodMarkerDb,
  source: MarkerIdentity,
  markers: ParsedVodChapters,
  durationSec: number
): VodMarkerDb {
  const episodeKey = episodeMarkerKey(source);
  const showKey = showMarkerKey(source);
  const now = Date.now();
  const episodes = { ...db.episodes };
  const shows = { ...db.shows };

  const intro: StoredIntro | undefined = markers.intro
    ? { ...markers.intro, source: "chapter" }
    : undefined;
  const creditsStartSec = markers.creditsStartSec;

  episodes[episodeKey] = {
    ...episodes[episodeKey],
    ...(intro ? { intro } : {}),
    ...(creditsStartSec != null
      ? { creditsStartSec, creditsSource: "chapter" as const }
      : {}),
    updatedAt: now,
  };

  if (showKey && (intro || creditsStartSec != null)) {
    const prev = shows[showKey];
    const fromEnd =
      creditsStartSec != null
        ? creditsFromEndSec(durationSec, creditsStartSec)
        : null;
    shows[showKey] = {
      ...prev,
      ...(intro ? { intro } : {}),
      ...(fromEnd != null
        ? { creditsFromEndSec: fromEnd, creditsSource: "chapter" as const }
        : {}),
      updatedAt: now,
    };
  }

  return { episodes, shows };
}

export function applyLearnedIntro(
  db: VodMarkerDb,
  source: MarkerIdentity,
  span: VodIntroSpan
): VodMarkerDb {
  const intro: StoredIntro = { ...span, source: "learned" };
  const episodeKey = episodeMarkerKey(source);
  const showKey = showMarkerKey(source);
  const now = Date.now();
  const episodes = { ...db.episodes };
  const shows = { ...db.shows };

  const prevEp = episodes[episodeKey];
  if (prevEp?.intro?.source !== "chapter") {
    episodes[episodeKey] = {
      ...prevEp,
      intro,
      updatedAt: now,
    };
  }

  if (showKey) {
    const prevShow = shows[showKey];
    if (prevShow?.intro?.source !== "chapter") {
      shows[showKey] = {
        ...prevShow,
        intro,
        updatedAt: now,
      };
    }
  }

  return { episodes, shows };
}

export function pruneVodMarkerDb(
  db: VodMarkerDb,
  limits: { episodes: number; shows: number } = { episodes: 400, shows: 200 }
): VodMarkerDb {
  return {
    episodes: pruneRecords(db.episodes, limits.episodes),
    shows: pruneRecords(db.shows, limits.shows),
  };
}

function pruneRecords<T extends { updatedAt: number }>(
  records: Record<string, T>,
  max: number
): Record<string, T> {
  const entries = Object.entries(records);
  if (entries.length <= max) return records;
  entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  return Object.fromEntries(entries.slice(0, max));
}
