/** Library sessions between Discord one-liners. */
export const LIBRARY_DISCORD_NUDGE_EVERY = 4;

export const LIBRARY_DISCORD_NUDGE_STATE_KEY =
  "streamly-library-discord-nudge-v1";

export const LIBRARY_DISCORD_NUDGE_SESSION_KEY =
  "streamly-library-discord-nudge-session-v1";

export type LibraryDiscordNudgeDecision = "show" | "hide";

/**
 * Count one Library visit per browser session. Show the line on every 4th
 * session so it is there sometimes and absent the rest of the time.
 */
export function decideLibraryDiscordNudge(input: {
  storedSessions: number;
  sessionDecision: LibraryDiscordNudgeDecision | null;
}): { show: boolean; sessions: number; sessionDecision: LibraryDiscordNudgeDecision } {
  if (input.sessionDecision === "show" || input.sessionDecision === "hide") {
    return {
      show: input.sessionDecision === "show",
      sessions: input.storedSessions,
      sessionDecision: input.sessionDecision,
    };
  }

  const sessions = Math.max(0, input.storedSessions) + 1;
  const show = sessions % LIBRARY_DISCORD_NUDGE_EVERY === 0;
  return {
    show,
    sessions,
    sessionDecision: show ? "show" : "hide",
  };
}
