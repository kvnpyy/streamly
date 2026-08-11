import { describe, expect, it } from "vitest";
import {
  categoryMatchesRegion,
  coerceTvRegion,
  defaultVodLanguageForCountry,
  defaultVodLanguageForRegion,
  extractCountryCode,
  getCategoryCountryIso,
  getCategoryRegion,
  getStreamRegion,
  sortLiveCategoriesForBrowse,
  streamMatchesRegion,
} from "./geo-continent";
import type { Category } from "./xtream-types";

describe("extractCountryCode", () => {
  it("parses CA and CAN prefixes", () => {
    expect(extractCountryCode("CA | TSN")).toBe("CA");
    expect(extractCountryCode("CAN | Sports")).toBe("CAN");
  });

  it("parses bracketed CANADA via alias", () => {
    expect(extractCountryCode("[CANADA] Entertainment")).toBe("CANADA");
    expect(getCategoryCountryIso("[CANADA] Entertainment")).toBe("CA");
  });
});

describe("getCategoryRegion", () => {
  it("maps Canada-named categories to North America", () => {
    expect(getCategoryRegion("Canada | General")).toBe("North America");
    expect(getCategoryRegion("CA | Sports")).toBe("North America");
    expect(getCategoryRegion("|AM| CANADA GENERAL")).toBe("North America");
    expect(getCategoryCountryIso("|AM| CANADA GENERAL")).toBe("CA");
  });
});

describe("categoryMatchesRegion", () => {
  it("North America includes US and CA categories", () => {
    expect(categoryMatchesRegion("US | Sports", "North America")).toBe(true);
    expect(categoryMatchesRegion("CA | Sports", "North America")).toBe(true);
    expect(categoryMatchesRegion("Canada | News", "North America")).toBe(true);
    expect(categoryMatchesRegion("|AM| CANADA GENERAL", "North America")).toBe(
      true
    );
    expect(categoryMatchesRegion("UK | Sports", "North America")).toBe(false);
  });

  it("excludes EU and ALB provider blocks from North America", () => {
    expect(categoryMatchesRegion("|EU| SWEDEN HD", "North America")).toBe(
      false
    );
    expect(categoryMatchesRegion("|ALB| CHILDREN", "North America")).toBe(
      false
    );
    expect(categoryMatchesRegion("|AM| MEXICO GENERAL", "North America")).toBe(
      false
    );
    expect(categoryMatchesRegion("|EU| SW MAX PPV", "Europe")).toBe(true);
    expect(categoryMatchesRegion("|ALB| DOCUMENTARY", "Europe")).toBe(true);
  });

  it("excludes Balkan provider blocks from North America", () => {
    expect(categoryMatchesRegion("|BLN| BOSNIA", "North America")).toBe(false);
    expect(categoryMatchesRegion("|BLN| CROATIA", "North America")).toBe(false);
    expect(categoryMatchesRegion("|HRV| CROATIA", "North America")).toBe(false);
    expect(categoryMatchesRegion("|MKD| MACEDONIA", "North America")).toBe(
      false
    );
    expect(categoryMatchesRegion("|BLN| BOSNIA", "Europe")).toBe(true);
    expect(categoryMatchesRegion("|BLN| CROATIA", "Europe")).toBe(true);
  });

  it("excludes Arabic and Argentina category labels from North America", () => {
    expect(categoryMatchesRegion("Arabic Entertainment", "North America")).toBe(
      false
    );
    expect(categoryMatchesRegion("|ARABIC| LIVE", "North America")).toBe(false);
    expect(categoryMatchesRegion("ARGENTINA SPORTS", "North America")).toBe(
      false
    );
    expect(categoryMatchesRegion("LATINO USA", "North America")).toBe(false);
    expect(categoryMatchesRegion("Arabic Entertainment", "Middle East")).toBe(
      true
    );
    expect(categoryMatchesRegion("ARGENTINA SPORTS", "Latin America")).toBe(
      true
    );
  });
});

describe("streamMatchesRegion", () => {
  it("North America keeps CA-tagged channels in generic categories", () => {
    expect(streamMatchesRegion("CA: TSN HD", "Sports", "North America")).toBe(
      true
    );
    expect(streamMatchesRegion("TSN", "Sports", "North America")).toBe(true);
    expect(streamMatchesRegion("UK: Sky", "Sports", "North America")).toBe(
      false
    );
  });

  it("North America keeps [EN] 24/7 marathon channels (language tag, not UK)", () => {
    const cat = "[US] 24/7 ENGLISH MOVIES/SERIES 4K";
    expect(categoryMatchesRegion(cat, "North America")).toBe(true);
    expect(streamMatchesRegion("[EN] COBRA KAI", cat, "North America")).toBe(
      true
    );
    expect(streamMatchesRegion("[EN] CHRISTMAS 1 4K", cat, "North America")).toBe(
      true
    );
    expect(getStreamRegion("[EN] COBRA KAI")).toBeNull();
  });

  it("shows generic 24/7 english rows on North America", () => {
    const cat = "24/7 ENGLISH MOVIES";
    expect(categoryMatchesRegion(cat, "North America")).toBe(true);
    expect(streamMatchesRegion("[EN] ARROW", cat, "North America")).toBe(true);
  });

  it("filters Balkan channel labels out of North America generic shelves", () => {
    expect(
      streamMatchesRegion("##### BOSNIA #####", "Sports", "North America")
    ).toBe(false);
    expect(
      streamMatchesRegion("##### CROATIA #####", "Sports", "North America")
    ).toBe(false);
    expect(
      streamMatchesRegion("##### BOSNIA #####", "Sports", "Europe")
    ).toBe(true);
  });

  it("filters Arabic and Argentina channels out of North America generic shelves", () => {
    expect(
      streamMatchesRegion("beIN Sports HD 1", "Sports", "North America")
    ).toBe(false);
    expect(
      streamMatchesRegion("ARGENTINA: TyC Sports", "Sports", "North America")
    ).toBe(false);
    expect(
      streamMatchesRegion("MBC Action HD", "Entertainment", "North America")
    ).toBe(false);
    expect(
      streamMatchesRegion("ESPN HD", "Sports", "North America")
    ).toBe(true);
  });
});

describe("coerceTvRegion", () => {
  it("maps legacy Canada selection to North America", () => {
    expect(coerceTvRegion("Canada")).toBe("North America");
    expect(coerceTvRegion("North America")).toBe("North America");
  });
});

describe("sortLiveCategoriesForBrowse", () => {
  const cats = (names: string[]): Category[] =>
    names.map((name, i) => ({
      category_id: String(i),
      category_name: name,
    })) as Category[];

  it("boosts Canadian categories when region is North America", () => {
    const sorted = sortLiveCategoriesForBrowse(
      cats(["US | Sports", "CA | News", "Canada | Entertainment", "UK | News"]),
      "North America"
    );
    expect(sorted[0]!.category_name).toMatch(/CA|Canada/i);
  });
});

describe("default VOD language", () => {
  it("defaults Latin America region to Spanish", () => {
    expect(defaultVodLanguageForRegion("Latin America")).toBe("ES");
  });

  it("overrides Brazil (and Portugal) to Portuguese by country", () => {
    expect(defaultVodLanguageForCountry("BR")).toBe("PT");
    expect(defaultVodLanguageForCountry("PT")).toBe("PT");
    expect(defaultVodLanguageForCountry("MX")).toBeNull();
  });
});
