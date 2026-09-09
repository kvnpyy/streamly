/** Convert provider sidecar files (SRT / VTT) into browser-playable WebVTT. */

const MAX_SUBTITLE_CHARS = 1_500_000;

export function looksLikeSubtitleText(raw: string): boolean {
  const t = raw.replace(/^\uFEFF/, "").trim();
  if (t.length < 8 || t.length > MAX_SUBTITLE_CHARS) return false;
  if (/^<!doctype html/i.test(t) || /^<html/i.test(t)) return false;
  if (/^\[script info\]/i.test(t)) return false;
  if (/^webvtt/i.test(t)) return true;
  if (/\d{2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{1,3}/.test(t)) {
    return true;
  }
  return false;
}

function padMs(raw: string): string {
  const n = raw.replace(/\D/g, "").slice(0, 3);
  return n.padEnd(3, "0");
}

/** SRT uses comma milliseconds; WebVTT needs a dot. */
export function srtTimecodeToVtt(line: string): string {
  return line.replace(
    /(\d{2}:\d{2}:\d{2})[,.](\d{1,3})/g,
    (_m, hms: string, ms: string) => `${hms}.${padMs(ms)}`
  );
}

export function srtToWebVtt(srt: string): string {
  const body = srt.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  const blocks = body.split(/\n{2,}/);
  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd());
    if (!lines.length) continue;
    let start = 0;
    if (/^\d+$/.test(lines[0] ?? "")) start = 1;
    const timing = lines[start];
    if (!timing || !timing.includes("-->")) continue;
    const rest = lines.slice(start + 1).join("\n").trim();
    cues.push(`${srtTimecodeToVtt(timing)}\n${rest}`.trim());
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function toWebVtt(raw: string): string {
  const text = raw.replace(/^\uFEFF/, "");
  const trimmed = text.trim();
  if (/^webvtt/i.test(trimmed)) {
    return text.includes("\n") ? text : `${text}\n`;
  }
  return srtToWebVtt(text);
}
