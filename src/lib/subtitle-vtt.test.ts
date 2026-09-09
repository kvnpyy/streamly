import { describe, expect, it } from "vitest";
import {
  looksLikeSubtitleText,
  srtToWebVtt,
  toWebVtt,
} from "@/lib/subtitle-vtt";

describe("subtitle VTT conversion", () => {
  it("converts SRT commas to WebVTT", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,500
Hello

2
00:00:05,000 --> 00:00:08,000
World
`;
    const vtt = srtToWebVtt(srt);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:04.500");
    expect(vtt).toContain("Hello");
    expect(vtt).toContain("World");
  });

  it("passes through existing WebVTT", () => {
    const raw = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n";
    expect(toWebVtt(raw)).toContain("WEBVTT");
    expect(toWebVtt(raw)).toContain("Hi");
  });

  it("rejects HTML error pages", () => {
    expect(looksLikeSubtitleText("<!doctype html><html>nope</html>")).toBe(
      false
    );
    expect(looksLikeSubtitleText("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nA")).toBe(
      true
    );
  });
});
