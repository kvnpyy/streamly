import { describe, expect, it } from "vitest";
import type { CountryIndex } from "./external-epg";
import { lookupChannel, normalizeChannelName } from "./external-epg";

function idx(partial: Pick<CountryIndex, "byName" | "programmes">): CountryIndex {
  return {
    country: "US",
    loadedAt: Date.now(),
    size: 1,
    ...partial,
  };
}

describe("normalizeChannelName", () => {
  it("maps Eastern/Western to East/West like IPTV feed names", () => {
    expect(normalizeChannelName("ABC Eastern USA")).toBe("abc east usa");
    expect(normalizeChannelName("NBC Western HD")).toBe("nbc west");
  });

  it("maps compound …ern regions to short forms", () => {
    expect(normalizeChannelName("CBS Southeastern USA")).toBe("cbs southeast usa");
    expect(normalizeChannelName("FOX Northwestern")).toBe("fox northwest");
  });
});

describe("lookupChannel", () => {
  const now = 1_700_000_000;

  it("matches A&E-style names via collapsed letter variant", () => {
    const index = idx({
      byName: new Map([["ae", ["ch-ae"]]]),
      programmes: new Map([
        [
          "ch-ae",
          [
            {
              channelId: "ch-ae",
              start: now,
              end: now + 3600,
              title: "Show",
            },
          ],
        ],
      ]),
    });
    const r = lookupChannel(index, "[USA] A&E HD", now - 60, now + 7200);
    expect(r.programmes.length).toBeGreaterThan(0);
    expect(r.matchedName).toBe("ae");
  });

  it("matches multi-token names when tokens are not contiguous (e.g. Fox West)", () => {
    const index = idx({
      byName: new Map([
        ["fox sports west national hd", ["ch-fw"]],
      ]),
      programmes: new Map([
        [
          "ch-fw",
          [
            {
              channelId: "ch-fw",
              start: now,
              end: now + 3600,
              title: "Local News",
            },
          ],
        ],
      ]),
    });
    const r = lookupChannel(index, "[USA] FOX WEST HD", now - 60, now + 7200);
    expect(r.programmes.length).toBeGreaterThan(0);
    expect(r.matchedName).toBe("fox sports west national hd");
  });

  it("falls back when normalized iptv name is substring of XMLTV display key", () => {
    const index = idx({
      byName: new Map([
        ["national abc east feed hd", ["ch-abc"]],
      ]),
      programmes: new Map([
        [
          "ch-abc",
          [
            {
              channelId: "ch-abc",
              start: now,
              end: now + 3600,
              title: "News",
            },
          ],
        ],
      ]),
    });
    const r = lookupChannel(index, "[USA] ABC EAST HD", now - 60, now + 7200);
    expect(r.programmes.length).toBeGreaterThan(0);
    expect(r.matchedName).toBe("national abc east feed hd");
  });

  it("falls back to parent network when regional feed name has no programmes", () => {
    const index = idx({
      byName: new Map([
        ["bet east hd", ["ch-bet-east-empty"]],
        ["bet", ["ch-bet-main"]],
      ]),
      programmes: new Map([
        ["ch-bet-east-empty", []],
        [
          "ch-bet-main",
          [
            {
              channelId: "ch-bet-main",
              start: now,
              end: now + 3600,
              title: "Evening",
            },
          ],
        ],
      ]),
    });
    const r = lookupChannel(index, "[USA] BET EAST HD", now - 60, now + 7200);
    expect(r.programmes.length).toBeGreaterThan(0);
    expect(r.matchedName).toBe("bet");
  });

  it("matches ABC when XMLTV uses Eastern spelling (no contiguous 'abc east')", () => {
    const index = idx({
      byName: new Map([["abc eastern usa", ["ch-abc-us"]]]),
      programmes: new Map([
        [
          "ch-abc-us",
          [
            {
              channelId: "ch-abc-us",
              start: now,
              end: now + 3600,
              title: "World News Now",
            },
          ],
        ],
      ]),
    });
    const r = lookupChannel(index, "[USA] ABC EAST HD", now - 60, now + 7200);
    expect(r.programmes.length).toBeGreaterThan(0);
    expect(r.matchedName).toBe("abc eastern usa");
  });

  it("matches 3-letter network token after stripping regional suffix", () => {
    const index = idx({
      byName: new Map([["abc america hd", ["ch-am"]]]),
      programmes: new Map([
        [
          "ch-am",
          [
            {
              channelId: "ch-am",
              start: now,
              end: now + 3600,
              title: "Daytime",
            },
          ],
        ],
      ]),
    });
    const r = lookupChannel(index, "[USA] ABC WEST HD", now - 60, now + 7200);
    expect(r.programmes.length).toBeGreaterThan(0);
    expect(r.matchedName).toBe("abc america hd");
  });

  it("matches feeds when XMLTV uses Southeastern spelling", () => {
    const index = idx({
      byName: new Map([["nbc southeastern usa", ["ch-se"]]]),
      programmes: new Map([
        [
          "ch-se",
          [
            {
              channelId: "ch-se",
              start: now,
              end: now + 3600,
              title: "Late Night",
            },
          ],
        ],
      ]),
    });
    const r = lookupChannel(index, "[USA] NBC SOUTHEAST HD", now - 60, now + 7200);
    expect(r.programmes.length).toBeGreaterThan(0);
    expect(r.matchedName).toBe("nbc southeastern usa");
  });
});
