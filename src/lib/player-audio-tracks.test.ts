import { describe, expect, it } from "vitest";
import {
  audioCodecShortLabel,
  audioTrackLanguageCodes,
  mapHlsAudioTracks,
  pickBrowserFriendlyAudioTrackIndex,
} from "./player-audio-tracks";

describe("mapHlsAudioTracks", () => {
  it("maps HLS audio tracks to player menu rows", () => {
    expect(
      mapHlsAudioTracks([
        { name: "English", lang: "en", audioCodec: "mp4a.40.2" },
        { lang: "es", audioCodec: "ac-3" },
      ])
    ).toEqual([
      { id: 0, label: "English", lang: "en" },
      { id: 1, label: "es", lang: "es" },
    ]);
  });
});

describe("audioCodecShortLabel", () => {
  it("recognizes common codecs", () => {
    expect(audioCodecShortLabel("mp4a.40.2")).toBe("AAC");
    expect(audioCodecShortLabel("ec-3")).toBe("E-AC-3");
  });
});

describe("audioTrackLanguageCodes", () => {
  it("reads language from the code or a label like English 5.1", () => {
    expect(audioTrackLanguageCodes({ lang: "en-US" })).toEqual(["en"]);
    expect(audioTrackLanguageCodes({ name: "English 5.1" })).toEqual(["en"]);
    expect(audioTrackLanguageCodes({ lang: "fra", name: "Français" })).toEqual([
      "fr",
    ]);
  });
});

describe("pickBrowserFriendlyAudioTrackIndex", () => {
  it("prefers English AAC over French AAC when the viewer wants English", () => {
    expect(
      pickBrowserFriendlyAudioTrackIndex(
        [
          { name: "Français", lang: "fr", audioCodec: "mp4a.40.2" },
          { name: "English", lang: "en", audioCodec: "mp4a.40.2" },
        ],
        ["en-US"]
      )
    ).toBe(1);
  });

  it("keeps French AAC when English is only Dolby the browser cannot play", () => {
    expect(
      pickBrowserFriendlyAudioTrackIndex(
        [
          { name: "English", lang: "en", audioCodec: "ac-3" },
          { name: "Français", lang: "fr", audioCodec: "mp4a.40.2" },
        ],
        ["en"]
      )
    ).toBe(1);
  });

  it("follows the viewer's language before the English fallback", () => {
    expect(
      pickBrowserFriendlyAudioTrackIndex(
        [
          { name: "English", lang: "en", audioCodec: "mp4a.40.2" },
          { name: "Français", lang: "fr", audioCodec: "mp4a.40.2" },
        ],
        ["fr-FR", "en"]
      )
    ).toBe(1);
  });
});
