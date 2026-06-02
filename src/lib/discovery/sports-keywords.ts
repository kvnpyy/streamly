import { parseChannelMeta } from "@/lib/channel-meta";

/** Programme / channel title patterns that indicate sports (EPG keyword shelf). */
export const SPORTS_PROGRAMME_PATTERNS: RegExp[] = [
  /\bufc\b/i,
  /\bnfl\b/i,
  /\bnba\b/i,
  /\bmlb\b/i,
  /\bnhl\b/i,
  /\bpremier league\b/i,
  /\bchampions league\b/i,
  /\bmls\b/i,
  /\bncaa\b/i,
  /\bcollege football\b/i,
  /\bcollege basketball\b/i,
  /\bworld cup\b/i,
  /\bsuper bowl\b/i,
  /\bstanley cup\b/i,
  /\bworld series\b/i,
  /\bmain card\b/i,
  /\bprelim\b/i,
  /\bfight night\b/i,
  /\bboxing\b/i,
  /\bwrestling\b/i,
  /\bmonday night football\b/i,
  /\bsunday night football\b/i,
  /\bthursday night football\b/i,
  /\bracing\b/i,
  /\bf1\b/i,
  /\bformula 1\b/i,
  /\bnascar\b/i,
  /\bgolf\b/i,
  /\btennis\b/i,
  /\bolympics\b/i,
];

const SPORTS_CHANNEL_TOPIC = /\bsports?\b/i;

export function programmeLooksLikeSports(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  return SPORTS_PROGRAMME_PATTERNS.some((re) => re.test(t));
}

export function channelLooksLikeSports(channelName: string): boolean {
  const meta = parseChannelMeta(channelName);
  if (meta.topic && SPORTS_CHANNEL_TOPIC.test(meta.topic)) return true;
  const blob = channelName.toLowerCase();
  return (
    /\bespn\b/.test(blob) ||
    /\bfox sports\b/.test(blob) ||
    /\bbt sport\b/.test(blob) ||
    /\bsky sports\b/.test(blob) ||
    /\btnt sports\b/.test(blob) ||
    /\bufc\b/.test(blob) ||
    /\bnfl\b/.test(blob) ||
    /\bnba\b/.test(blob) ||
    /\bmlb\b/.test(blob) ||
    /\bnhl\b/.test(blob) ||
    /\bdazn\b/.test(blob) ||
    /\bbein\b/.test(blob) ||
    /\bpeacock\b/.test(blob) && /\bsport/.test(blob)
  );
}

export function textMatchesSportsKeywords(text: string): boolean {
  return programmeLooksLikeSports(text) || channelLooksLikeSports(text);
}
