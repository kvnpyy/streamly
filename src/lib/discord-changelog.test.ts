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

    const embed = announced.payload.embeds[0];
    expect(embed.title).toBe("Streamly 0.4.0");
    expect(embed.url).toBe("https://iptvwebplayer.org/changelog#v0.4.0");
    expect(embed.description).toBe(
      [
        "TV pairing is faster, and the guide still loads when the provider feed fails.",
        "",
        "- Pairing finishes sooner on the TV browser.",
        "- The guide loads if the provider one fails.",
        "- Resume works again on mobile.",
      ].join("\n")
    );
    expect(embed.description).not.toMatch(/\bEPG\b/);
    expect(embed.timestamp).toBe("2026-09-28T12:00:00.000Z");
    expect(JSON.stringify(announced.payload)).not.toMatch(/Try it|iptvwebplayer\.org\/(?!changelog)|Next\.js|refactor/);
    expect(announced.payload.content).toBe("@here");
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

    expect(announced.payload.content).toBeUndefined();
    expect(announced.content).not.toContain("@here");
    expect(announced.payload.allowed_mentions.parse).toEqual([]);
  });

  it("drops codec jargon and never posts a secret", () => {
    const markdown = `## [0.13.51] — 2026-09-29

Episode soundtracks that are surround play in the browser.

### Fixed
- Episode files whose real soundtrack is surround (AC-3) were copying a stub AAC track the browser plays as silence. That mix is re-encoded to AAC instead.
- Provider host 141.227.131.43 rejected the password in .env.
`;
    const announced = buildChangelogAnnouncement({
      markdown,
      version: "0.13.51",
      mentionHere: false,
    });
    expect(announced.skip).toBe(false);
    if (announced.skip) return;
    const description = announced.payload.embeds[0].description;
    expect(description).toBe(
      "Episode soundtracks that are surround play in the browser."
    );
    expect(description).not.toMatch(/AC-3|AAC|re-encoded|141\.227|password|\.env/i);
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
