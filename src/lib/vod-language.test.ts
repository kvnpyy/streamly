import { describe, expect, it } from "vitest";
import {
  collectVodLanguages,
  extractVodLanguageCode,
  normalizeVodLanguageCode,
  vodItemMatchesLanguage,
  vodLanguageLabel,
} from "@/lib/vod-language";
import type { Category } from "@/lib/xtream-types";

describe("extractVodLanguageCode", () => {
  it("reads dash-separated title prefixes", () => {
    expect(extractVodLanguageCode("EN - Rick and Morty")).toBe("EN");
    expect(extractVodLanguageCode("FR - One Piece")).toBe("FR");
    expect(extractVodLanguageCode("NL - The Boys")).toBe("NL");
  });

  it("reads bracket prefixes", () => {
    expect(extractVodLanguageCode("[EN] Cobra Kai")).toBe("EN");
    expect(extractVodLanguageCode("[FR] Viral Hit")).toBe("FR");
  });

  it("reads language words in category names", () => {
    expect(extractVodLanguageCode("ENGLISH MOVIES 4K")).toBe("EN");
    expect(extractVodLanguageCode("French Series")).toBe("FR");
  });
});

describe("vodItemMatchesLanguage", () => {
  it("matches title prefix against selected language", () => {
    expect(vodItemMatchesLanguage("EN - Alpha", "EN")).toBe(true);
    expect(vodItemMatchesLanguage("FR - Alpha", "EN")).toBe(false);
  });

  it("falls back to category name when title has no prefix", () => {
    expect(
      vodItemMatchesLanguage("One Piece", "FR", "[FR] Anime")
    ).toBe(true);
  });
});

describe("collectVodLanguages", () => {
  it("returns sorted unique language codes", () => {
    const categories: Category[] = [
      { category_id: "1", category_name: "Action", parent_id: 0 },
    ];
    const langs = collectVodLanguages(
      [
        { name: "EN - Alpha", category_id: "1" },
        { name: "FR - Beta", category_id: "1" },
        { name: "EN - Gamma", category_id: "1" },
      ],
      categories
    );
    expect(langs).toEqual(["EN", "FR"]);
  });
});

describe("normalizeVodLanguageCode", () => {
  it("maps ENG to EN", () => {
    expect(normalizeVodLanguageCode("ENG")).toBe("EN");
  });
});

describe("vodLanguageLabel", () => {
  it("returns friendly labels", () => {
    expect(vodLanguageLabel("EN")).toBe("English");
    expect(vodLanguageLabel("FR")).toBe("French");
  });
});
