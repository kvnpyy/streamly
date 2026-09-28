import { describe, expect, it } from "vitest";
import { decideLibraryDiscordNudge } from "./library-discord-nudge";

describe("decideLibraryDiscordNudge", () => {
  it("hides the line for the first three library sessions", () => {
    let sessions = 0;
    const shown: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const next = decideLibraryDiscordNudge({
        storedSessions: sessions,
        sessionDecision: null,
      });
      shown.push(next.show);
      sessions = next.sessions;
    }
    expect(shown).toEqual([false, false, false]);
    expect(sessions).toBe(3);
  });

  it("shows the line on every fourth new session", () => {
    let sessions = 0;
    const shown: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      const next = decideLibraryDiscordNudge({
        storedSessions: sessions,
        sessionDecision: null,
      });
      shown.push(next.show);
      sessions = next.sessions;
    }
    expect(shown).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
    ]);
  });

  it("keeps the same decision for the rest of the session", () => {
    const hidden = decideLibraryDiscordNudge({
      storedSessions: 2,
      sessionDecision: "hide",
    });
    expect(hidden.show).toBe(false);
    expect(hidden.sessions).toBe(2);

    const visible = decideLibraryDiscordNudge({
      storedSessions: 4,
      sessionDecision: "show",
    });
    expect(visible.show).toBe(true);
    expect(visible.sessions).toBe(4);
  });
});
