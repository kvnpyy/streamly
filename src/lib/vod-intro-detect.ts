import type { ParsedVodChapters, VodIntroSpan } from "@/lib/vod-chapter-markers";

export type OpeningGap = { startSec: number; endSec: number };

/** First window of encoded opening we will measure. */
export const INTRO_SCAN_FIRST_SEC = 120;
/** Second pass when the first window ends on a gap that might still be the theme. */
export const INTRO_SCAN_MAX_SEC = 200;

const MIN_INTRO_END_SEC = 12;
const MAX_INTRO_END_SEC = 190;

function roundSec(sec: number): number {
  return Math.round(sec * 10) / 10;
}

function gapDur(gap: OpeningGap): number {
  return gap.endSec - gap.startSec;
}

/**
 * Where the opening ends, from black cuts and silence in the first minutes.
 * Returns null when the opening has no clear boundary — callers keep the
 * placeholder instead of inventing a time.
 */
export function introEndFromOpeningGaps(opts: {
  silence: readonly OpeningGap[];
  black: readonly OpeningGap[];
}): VodIntroSpan | null {
  const silences = opts.silence.filter((gap) => {
    const dur = gapDur(gap);
    return (
      gap.startSec >= 15 &&
      gap.endSec >= MIN_INTRO_END_SEC &&
      gap.endSec <= 170 &&
      dur >= 0.8 &&
      dur <= 6
    );
  });
  const blacks = opts.black.filter((gap) => {
    const dur = gapDur(gap);
    return (
      gap.startSec >= 22 &&
      gap.endSec <= MAX_INTRO_END_SEC &&
      dur >= 0.12 &&
      dur <= 3.5
    );
  });

  const longestSilence = [...silences].sort((a, b) => {
    const byDur = gapDur(b) - gapDur(a);
    if (Math.abs(byDur) > 0.15) return byDur;
    return a.startSec - b.startSec;
  })[0];

  if (longestSilence) {
    const paired = [...blacks]
      .reverse()
      .find(
        (black) =>
          black.startSec <= longestSilence.endSec + 1.5 &&
          black.endSec >= longestSilence.startSec - 1.5
      );
    const endSec = paired ? paired.endSec : longestSilence.endSec;
    if (endSec < MIN_INTRO_END_SEC) return null;
    return { startSec: 0, endSec: roundSec(endSec), kind: "intro" };
  }

  const latestBlack = blacks[blacks.length - 1];
  if (!latestBlack || latestBlack.endSec < MIN_INTRO_END_SEC) return null;
  return { startSec: 0, endSec: roundSec(latestBlack.endSec), kind: "intro" };
}

export function parseSilenceDetectLog(log: string): OpeningGap[] {
  const starts: number[] = [];
  const gaps: OpeningGap[] = [];
  for (const line of log.split(/\r?\n/)) {
    const start = line.match(/silence_start:\s*([\d.]+)/);
    if (start) {
      const n = parseFloat(start[1]!);
      if (Number.isFinite(n)) starts.push(n);
      continue;
    }
    const end = line.match(/silence_end:\s*([\d.]+)/);
    if (!end || starts.length === 0) continue;
    const endSec = parseFloat(end[1]!);
    const startSec = starts.shift()!;
    if (Number.isFinite(endSec) && endSec > startSec) {
      gaps.push({ startSec, endSec });
    }
  }
  return gaps;
}

export function parseBlackDetectLog(log: string): OpeningGap[] {
  const gaps: OpeningGap[] = [];
  const re = /black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g;
  for (const line of log.split(/\r?\n/)) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(line))) {
      const startSec = parseFloat(match[1]!);
      const endSec = parseFloat(match[2]!);
      if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec) {
        gaps.push({ startSec, endSec });
      }
    }
  }
  return gaps;
}

/**
 * Local ffmpeg playlist covering only the opening, so the scan does not decode
 * the rest of a finished episode. Null when there is not enough media yet.
 */
export function openingScanPlaylist(
  manifest: string,
  maxSec: number
): string | null {
  const lines = manifest.split(/\r?\n/);
  const out: string[] = [];
  let sum = 0;
  let pendingExtinf: string | null = null;
  let sawSegment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#EXTINF:/i.test(trimmed)) {
      pendingExtinf = line;
      continue;
    }
    if (trimmed.startsWith("#")) {
      if (!pendingExtinf) out.push(line);
      continue;
    }
    if (!pendingExtinf) continue;
    const durMatch = pendingExtinf.match(/^#EXTINF:([\d.]+)/i);
    const dur = durMatch ? parseFloat(durMatch[1]!) : 0;
    out.push(pendingExtinf, line);
    pendingExtinf = null;
    sawSegment = true;
    if (Number.isFinite(dur) && dur > 0) sum += dur;
    if (sum >= maxSec) break;
  }
  if (!sawSegment || sum < 20) return null;
  return `${out.join("\n")}\n`;
}

export function introScanLimitSec(titleDurationSec: number | null): number {
  if (titleDurationSec != null && titleDurationSec > 40) {
    return Math.min(INTRO_SCAN_MAX_SEC, titleDurationSec);
  }
  return INTRO_SCAN_MAX_SEC;
}

/**
 * Whether the encoded opening is long enough to measure, and whether a result
 * from the current window is final.
 */
export function introProbeStep(opts: {
  encodedSec: number;
  encodeFinished: boolean;
  titleDurationSec: number | null;
  /** Seconds of opening the last scan actually covered. 0 if none yet. */
  scannedSec: number;
  foundEndSec: number | null;
}): "wait" | "scan" | "done" | "give-up" {
  const cap = introScanLimitSec(opts.titleDurationSec);
  if (opts.encodeFinished && opts.encodedSec < 25) return "give-up";
  const firstTarget = Math.min(INTRO_SCAN_FIRST_SEC, cap);

  if (opts.scannedSec <= 0) {
    if (opts.encodedSec + 0.5 < firstTarget && !opts.encodeFinished) return "wait";
    if (opts.encodedSec < 25) return "give-up";
    return "scan";
  }

  if (opts.foundEndSec == null) {
    const room =
      opts.scannedSec + 0.5 < cap && opts.encodedSec > opts.scannedSec + 15;
    if (room && (opts.encodeFinished || opts.encodedSec + 0.5 >= cap)) {
      return "scan";
    }
    if (opts.encodeFinished || opts.scannedSec + 0.5 >= cap) return "give-up";
    return "wait";
  }

  const nearEdge = opts.foundEndSec > opts.scannedSec - 15;
  if (nearEdge && opts.scannedSec + 0.5 < cap && !opts.encodeFinished) {
    if (opts.encodedSec + 0.5 < cap) return "wait";
    return "scan";
  }
  return "done";
}

/** Chapter titles win. A measured opening fills in only when chapters have none. */
export function withDetectedIntro(
  prev: ParsedVodChapters | null | undefined,
  intro: VodIntroSpan
): ParsedVodChapters {
  if (prev?.intro && prev.introOrigin !== "detected") return prev;
  return {
    ...prev,
    intro,
    introOrigin: "detected",
  };
}

/** ffprobe chapters replace a measured intro. Credits fill in beside either. */
export function mergeProbedChapters(
  prev: ParsedVodChapters | null | undefined,
  probed: ParsedVodChapters
): ParsedVodChapters {
  const intro = probed.intro ?? prev?.intro;
  const introOrigin = probed.intro
    ? "chapter"
    : prev?.intro
      ? (prev.introOrigin ?? "detected")
      : undefined;
  const credits = probed.creditsStartSec ?? prev?.creditsStartSec;
  return {
    ...(intro ? { intro } : {}),
    ...(introOrigin && intro ? { introOrigin } : {}),
    ...(credits != null ? { creditsStartSec: credits } : {}),
  };
}
