import { describe, expect, it } from "vitest";
import {
  audioCodecShortLabel,
  mapHlsAudioTracks,
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
