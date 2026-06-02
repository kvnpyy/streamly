/**
 * Filter IPTV listing spam from discovery / trending (PPV placeholders, etc.).
 */

const SPAM_RE =
  /no event streaming|8k exclusive|\bppv\b|event\s*streaming|test\s*stream|placeholder|not\s*24\/7/i;

/** Pipe-heavy channel names (e.g. "| 8K | SE: MAX PPV 100 |"). */
function pipeSpamName(name: string): boolean {
  const pipes = (name.match(/\|/g) ?? []).length;
  return pipes >= 2 && name.length > 40;
}

export function isSpamLiveListing(
  channelName: string,
  programmeTitle?: string | null
): boolean {
  const name = channelName.trim();
  const prog = (programmeTitle ?? "").trim();
  const combined = `${name} ${prog}`;
  if (!name) return true;
  if (SPAM_RE.test(combined)) return true;
  if (pipeSpamName(name)) return true;
  if (prog && SPAM_RE.test(prog)) return true;
  return false;
}

export function filterScoredLiveEntries<T extends { stream: { name: string }; programmeTitle?: string }>(
  entries: T[]
): T[] {
  return entries.filter(
    (e) => !isSpamLiveListing(e.stream.name, e.programmeTitle)
  );
}
