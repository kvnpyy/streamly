import { describe, expect, it } from "vitest";
import {
  buildChangelogAnnouncement,
  parseChangelogEntry,
} from "../../scripts/discord-changelog.mjs";

const SAMPLE = `# Changelog

## [Unreleased]

## [0.4.0] — 2026-09-28

TV pairing is faster, and the guide still loads when the provider feed fails.

### Added
- **TV pairing** — pairing finishes sooner on the TV browser.
- **EPG** — the guide loads if the provider one fails.

### Fixed
- **Series resume** — resume works again on mobile.
- Updated Next.js and refactored the stores.

## [0.3.0] — 2026-06-01

Older notes.

### Fixed
- Something older.
`;

describe("discord changelog", () => {
  it("reads the matching version and ignores the next section", () => {
    const entry = parseChangelogEntry(SAMPLE, "v0.4.0");
    expect(entry?.version).toBe("0.4.0");
    expect(entry?.summary).toMatch(/TV pairing is faster/);
    expect(entry?.bullets).toHaveLength(4);
    expect(parseChangelogEntry(SAMPLE, "v9.9.9")).toBeNull();
  });

  it("posts short user-visible notes and pings @here only when asked", () => {
    const announced = buildChangelogAnnouncement({
      markdown: SAMPLE,
      version: "0.4.0",
      mentionHere: true,
    });
    expect(announced.skip).toBe(false);
    if (announced.skip) return;

    expect(announced.content).toBe(
      [
        "@here",
        "v0.4.0",
        "TV pairing is faster, and the guide still loads when the provider feed fails.",
        "TV pairing — pairing finishes sooner on the TV browser.",
        "EPG — the guide loads if the provider one fails.",
        "Series resume — resume works again on mobile.",
        "Full notes: https://iptvwebplayer.org/changelog#v0.4.0",
        "",
        "Try it: https://iptvwebplayer.org",
      ].join("\n")
    );
    expect(announced.content).not.toMatch(/Next\.js|refactor/);
    expect(announced.payload.allowed_mentions.parse).toEqual(["everyone"]);
  });

  it("does not mention anyone for a quiet post", () => {
    const announced = buildChangelogAnnouncement({
      markdown: SAMPLE,
      version: "0.4.0",
      mentionHere: false,
    });
    expect(announced.skip).toBe(false);
    if (announced.skip) return;

    expect(announced.content.startsWith("v0.4.0")).toBe(true);
    expect(announced.content).not.toContain("@here");
    expect(announced.payload.allowed_mentions.parse).toEqual([]);
  });

  it("skips a release that is only dependency noise", () => {
    const markdown = `## [0.4.1] — 2026-09-28

Updated Next.js.

### Changed
- Refactored stores and bumped dependencies.
`;
    const announced = buildChangelogAnnouncement({
      markdown,
      version: "0.4.1",
      mentionHere: true,
    });
    expect(announced.skip).toBe(true);
  });
});
