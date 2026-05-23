import { describe, expect, it } from "vitest";
import { isBenignMediaPlayError } from "./video-play";

describe("isBenignMediaPlayError", () => {
  it("matches DOMException AbortError", () => {
    const err = new DOMException(
      "The play() request was interrupted by a call to pause().",
      "AbortError"
    );
    expect(isBenignMediaPlayError(err)).toBe(true);
  });

  it("matches plain objects with AbortError name", () => {
    expect(isBenignMediaPlayError({ name: "AbortError" })).toBe(true);
  });

  it("matches message-only play interruption strings", () => {
    expect(
      isBenignMediaPlayError(
        new Error(
          "The play() request was interrupted by a call to pause(). https://goo.gl/LdLk22"
        )
      )
    ).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isBenignMediaPlayError(new Error("Network error"))).toBe(false);
    expect(isBenignMediaPlayError(null)).toBe(false);
  });
});
