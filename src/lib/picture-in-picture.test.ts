import { describe, expect, it, vi } from "vitest";
import {
  isBenignPictureInPictureError,
  isPictureInPictureSupported,
} from "./picture-in-picture";

describe("picture-in-picture", () => {
  it("isBenignPictureInPictureError detects metadata-not-loaded PiP errors", () => {
    const err = new DOMException(
      "Failed to execute 'requestPictureInPicture' on 'HTMLVideoElement': Metadata for the video element are not loaded yet.",
      "InvalidStateError"
    );
    expect(isBenignPictureInPictureError(err)).toBe(true);
  });

  it("isPictureInPictureSupported is false without requestPictureInPicture", () => {
    const video = {
      requestPictureInPicture: undefined,
    } as unknown as HTMLVideoElement;
    expect(isPictureInPictureSupported(video)).toBe(false);
  });

  it("isPictureInPictureSupported is true when API exists", () => {
    vi.stubGlobal("document", {
      pictureInPictureEnabled: true,
    });
    const video = {
      requestPictureInPicture: () => Promise.resolve(),
    } as unknown as HTMLVideoElement;
    expect(isPictureInPictureSupported(video)).toBe(true);
    vi.unstubAllGlobals();
  });
});
