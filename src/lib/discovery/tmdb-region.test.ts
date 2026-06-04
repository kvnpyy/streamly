import { describe, expect, it } from "vitest";
import { resolveTmdbCountry, tvRegionToTmdbCountry } from "@/lib/discovery/tmdb-region";

describe("tvRegionToTmdbCountry", () => {
  it("maps North America to US and Oceania to AU", () => {
    expect(tvRegionToTmdbCountry("North America")).toBe("US");
    expect(tvRegionToTmdbCountry("Oceania")).toBe("AU");
  });

  it("resolveTmdbCountry prefers TV browse region over env", () => {
    expect(resolveTmdbCountry({ tvRegion: "North America" })).toBe("US");
    expect(resolveTmdbCountry({ tvRegion: "Oceania" })).toBe("AU");
  });
});
