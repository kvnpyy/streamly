import { describe, expect, it } from "vitest";
import { welcomeDisplayName } from "./welcome-display-name";

describe("welcomeDisplayName", () => {
  it("prefers Stream display name over IPTV username", () => {
    expect(
      welcomeDisplayName({
        streamName: "Kevin",
        streamEmail: "kevin@example.com",
        iptvUsername: "x7f9a2b",
      })
    ).toBe("Kevin");
  });

  it("uses email local part when no display name", () => {
    expect(
      welcomeDisplayName({
        streamEmail: "kevin.payoyo@example.com",
        iptvUsername: "x7f9a2b",
      })
    ).toBe("Kevin");
  });

  it("falls back to IPTV username for guest-only sessions", () => {
    expect(
      welcomeDisplayName({
        iptvUsername: "familyroom",
      })
    ).toBe("familyroom");
  });

  it("hides random hex panel logins", () => {
    expect(
      welcomeDisplayName({
        iptvUsername: "ca6517ba",
      })
    ).toBe("there");
  });
});
