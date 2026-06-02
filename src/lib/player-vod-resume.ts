import type { PlayerSource } from "@/store/player";

/** Stable key for persisted VOD resume (`accountKey|movie|streamId`). */
export function vodResumeStorageKey(
  accountKey: string | undefined,
  current: PlayerSource | null
): string | null {
  if (!accountKey || !current || current.kind === "live") return null;
  const sid = current.streamId ?? current.id;
  return `${accountKey}|${current.kind}|${sid}`;
}
