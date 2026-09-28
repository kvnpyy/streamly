/** Intro / credits spans learned from container chapters (ffprobe). */

export type VodIntroKind = "intro" | "recap";

export type VodIntroSpan = {
  startSec: number;
  endSec: number;
  kind: VodIntroKind;
};

export type ParsedVodChapters = {
  intro?: VodIntroSpan;
  creditsStartSec?: number;
};

export type ProbeChapter = {
  startSec: number;
  endSec: number;
  title: string;
};

export const VOD_INTRO_START_HEADER = "x-vod-intro-start";
export const VOD_INTRO_END_HEADER = "x-vod-intro-end";
export const VOD_INTRO_KIND_HEADER = "x-vod-intro-kind";
export const VOD_CREDITS_START_HEADER = "x-vod-credits-start";

const INTRO_TITLE =
  /\b(opening credits|title sequence|theme song|opening|intro|introduction)\b|(?:^|[\s._-])op(?:$|[\s._-])/i;
const RECAP_TITLE = /\b(previously on|previously|recap)\b/i;
const CREDITS_TITLE =
  /\b(end credits|ending credits|closing credits|credits|ending|outro)\b|(?:^|[\s._-])ed(?:$|[\s._-])/i;

function finiteSec(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 86_400) return null;
  return n;
}

export function readProbeChapters(raw: unknown): ProbeChapter[] {
  if (!raw || typeof raw !== "object") return [];
  const chapters = (raw as { chapters?: unknown }).chapters;
  if (!Array.isArray(chapters)) return [];
  const out: ProbeChapter[] = [];
  for (const row of chapters) {
    if (!row || typeof row !== "object") continue;
    const rec = row as {
      start_time?: unknown;
      end_time?: unknown;
      tags?: { title?: unknown };
    };
    const startSec = finiteSec(rec.start_time);
    const endSec = finiteSec(rec.end_time);
    if (startSec == null || endSec == null || endSec <= startSec) continue;
    const titleRaw = rec.tags?.title;
    const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
    if (!title) continue;
    out.push({ startSec, endSec, title });
  }
  out.sort((a, b) => a.startSec - b.startSec);
  return out;
}

function usableEarlySpan(chapter: ProbeChapter, kind: VodIntroKind): VodIntroSpan | null {
  const length = chapter.endSec - chapter.startSec;
  if (chapter.startSec > 6 * 60) return null;
  if (length < 8 || length > 200) return null;
  if (chapter.endSec > 6 * 60 + 30) return null;
  return {
    startSec: chapter.startSec,
    endSec: chapter.endSec,
    kind,
  };
}

function pickCreditsStart(
  chapters: readonly ProbeChapter[],
  durationSec: number | null | undefined
): number | undefined {
  const hits = chapters.filter((c) => CREDITS_TITLE.test(c.title));
  if (hits.length === 0) return undefined;
  const last = hits[hits.length - 1]!;
  const dur =
    durationSec != null && Number.isFinite(durationSec) && durationSec > 60
      ? durationSec
      : null;
  if (dur != null) {
    if (last.startSec < dur * 0.5) return undefined;
    if (last.startSec >= dur - 5) return undefined;
    return last.startSec;
  }
  if (last.startSec < 10 * 60) return undefined;
  return last.startSec;
}

export function markersFromChapters(
  chapters: readonly ProbeChapter[],
  durationSec?: number | null
): ParsedVodChapters | null {
  const introHit = chapters.find((c) => INTRO_TITLE.test(c.title));
  const recapHit = chapters.find((c) => RECAP_TITLE.test(c.title));
  const intro = introHit ? usableEarlySpan(introHit, "intro") : null;
  const recap = recapHit ? usableEarlySpan(recapHit, "recap") : null;

  let early: VodIntroSpan | undefined;
  if (intro && recap && intro.startSec <= recap.endSec + 8) {
    const endSec = Math.max(intro.endSec, recap.endSec);
    const startSec = Math.min(intro.startSec, recap.startSec);
    if (endSec - startSec >= 8 && endSec <= 6 * 60 + 30) {
      early = { startSec, endSec, kind: "intro" };
    }
  }
  if (!early) early = intro ?? recap ?? undefined;

  const creditsStartSec = pickCreditsStart(chapters, durationSec);
  if (!early && creditsStartSec == null) return null;
  return {
    ...(early ? { intro: early } : {}),
    ...(creditsStartSec != null ? { creditsStartSec } : {}),
  };
}

export function parseFfprobeChapterDump(
  raw: unknown,
  durationSec?: number | null
): ParsedVodChapters | null {
  return markersFromChapters(readProbeChapters(raw), durationSec);
}

export function chapterMarkerResponseHeaders(
  markers: ParsedVodChapters
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (markers.intro) {
    headers[VOD_INTRO_START_HEADER] = markers.intro.startSec.toFixed(3);
    headers[VOD_INTRO_END_HEADER] = markers.intro.endSec.toFixed(3);
    headers[VOD_INTRO_KIND_HEADER] = markers.intro.kind;
  }
  if (markers.creditsStartSec != null) {
    headers[VOD_CREDITS_START_HEADER] = markers.creditsStartSec.toFixed(3);
  }
  return headers;
}

export function chapterMarkersFromHeaders(opts: {
  introStart: string | null | undefined;
  introEnd: string | null | undefined;
  introKind: string | null | undefined;
  creditsStart: string | null | undefined;
}): ParsedVodChapters | null {
  const start = finiteSec(opts.introStart ?? undefined);
  const end = finiteSec(opts.introEnd ?? undefined);
  const credits = finiteSec(opts.creditsStart ?? undefined);
  const kind: VodIntroKind | null =
    opts.introKind === "recap" ? "recap" : opts.introKind === "intro" ? "intro" : null;
  const intro =
    start != null && end != null && end > start + 4 && kind
      ? { startSec: start, endSec: end, kind }
      : undefined;
  if (!intro && credits == null) return null;
  return {
    ...(intro ? { intro } : {}),
    ...(credits != null ? { creditsStartSec: credits } : {}),
  };
}

export function sameChapterMarkers(
  a: ParsedVodChapters | null | undefined,
  b: ParsedVodChapters | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const aIntro = a.intro;
  const bIntro = b.intro;
  if (!!aIntro !== !!bIntro) return false;
  if (aIntro && bIntro) {
    if (aIntro.kind !== bIntro.kind) return false;
    if (Math.abs(aIntro.startSec - bIntro.startSec) > 0.05) return false;
    if (Math.abs(aIntro.endSec - bIntro.endSec) > 0.05) return false;
  }
  const ac = a.creditsStartSec;
  const bc = b.creditsStartSec;
  if (ac == null && bc == null) return true;
  if (ac == null || bc == null) return false;
  return Math.abs(ac - bc) <= 0.05;
}
