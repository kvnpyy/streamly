import { describe, expect, it, vi } from "vitest";
import {
  isBenignPictureInPictureError,
  isPictureInPictureSupported,
  isVideoInPictureInPicture,
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

  it("isVideoInPictureInPicture is true for the active PiP element", () => {
    const video = {} as HTMLVideoElement;
    vi.stubGlobal("document", { pictureInPictureElement: video });
    expect(isVideoInPictureInPicture(video)).toBe(true);
    expect(isVideoInPictureInPicture({} as HTMLVideoElement)).toBe(false);
    vi.unstubAllGlobals();
  });

  it("isVideoInPictureInPicture detects Safari webkitPresentationMode", () => {
    const video = {
      webkitPresentationMode: "picture-in-picture",
    } as HTMLVideoElement;
    expect(isVideoInPictureInPicture(video)).toBe(true);
  });
});
