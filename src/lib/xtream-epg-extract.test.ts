import { describe, expect, it } from "vitest";
import { extractXtreamEpgPayload } from "./xtream";

describe("extractXtreamEpgPayload", () => {
  it("reads top-level epg_listings", () => {
    expect(
      extractXtreamEpgPayload({
        epg_listings: [{ id: "1", title: "x" }],
      }).epg_listings
    ).toHaveLength(1);
  });

  it("reads alternate keys and root arrays", () => {
    expect(extractXtreamEpgPayload([{ id: "a" }])).toEqual({
      epg_listings: [{ id: "a" }],
    });
    expect(
      extractXtreamEpgPayload({ epgs: [{ id: "b" }] }).epg_listings
    ).toHaveLength(1);
  });

  it("unwraps one nested object holding listings", () => {
    expect(
      extractXtreamEpgPayload({
        data: { epg_listings: [{ id: "c" }] },
      }).epg_listings
    ).toHaveLength(1);
  });
});
