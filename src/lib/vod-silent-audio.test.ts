import { describe, expect, it } from "vitest";
import { videoLikelyMissingDecodableAudio } from "@/lib/vod-silent-audio";

function fakeVideo(
  patch: Partial<HTMLVideoElement> & Record<string, unknown>
): HTMLVideoElement {
  return {
    currentTime: 0,
    readyState: 0,
    ...patch,
  } as unknown as HTMLVideoElement;
}

describe("videoLikelyMissingDecodableAudio", () => {
  it("uses mozHasAudio when present", () => {
    expect(
      videoLikelyMissingDecodableAudio(
        fakeVideo({ mozHasAudio: false, currentTime: 3, readyState: 3 })
      )
    ).toBe(true);
    expect(
      videoLikelyMissingDecodableAudio(
        fakeVideo({ mozHasAudio: true, currentTime: 3, readyState: 3 })
      )
    ).toBe(false);
  });

  it("waits before trusting webkitAudioDecodedByteCount", () => {
    expect(
      videoLikelyMissingDecodableAudio(
        fakeVideo({
          webkitAudioDecodedByteCount: 0,
          currentTime: 0.2,
          readyState: 2,
        })
      )
    ).toBe("unknown");
  });

  it("flags silent Chromium progressive after playback advances", () => {
    expect(
      videoLikelyMissingDecodableAudio(
        fakeVideo({
          webkitAudioDecodedByteCount: 0,
          currentTime: 2.5,
          readyState: 3,
        })
      )
    ).toBe(true);
    expect(
      videoLikelyMissingDecodableAudio(
        fakeVideo({
          webkitAudioDecodedByteCount: 4096,
          currentTime: 2.5,
          readyState: 3,
        })
      )
    ).toBe(false);
  });

  it("returns unknown when no signals exist", () => {
    expect(
      videoLikelyMissingDecodableAudio(
        fakeVideo({ currentTime: 5, readyState: 4 })
      )
    ).toBe("unknown");
  });
});
