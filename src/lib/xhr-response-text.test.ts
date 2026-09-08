import { describe, expect, it } from "vitest";
import { readXhrBodyAsText } from "./xhr-response-text";

function fakeXhr(partial: {
  responseType?: XMLHttpRequestResponseType;
  responseText?: string;
  response?: unknown;
}): XMLHttpRequest {
  return partial as unknown as XMLHttpRequest;
}

describe("readXhrBodyAsText", () => {
  it("reads responseText for default and text responseType", () => {
    expect(
      readXhrBodyAsText(
        fakeXhr({ responseType: "", responseText: "  hello  " })
      )
    ).toBe("hello");
    expect(
      readXhrBodyAsText(
        fakeXhr({ responseType: "text", responseText: '{"error":"x"}' })
      )
    ).toBe('{"error":"x"}');
  });

  it("decodes arraybuffer bodies instead of touching responseText", () => {
    const encoded = new TextEncoder().encode('{"errorText":"busy"}');
    const xhr = fakeXhr({
      responseType: "arraybuffer",
      response: encoded.buffer,
      // If the helper wrongly read this, the test host would throw InvalidStateError
      // in a real browser; we omit responseText to mirror that inaccessibility.
    });
    expect(readXhrBodyAsText(xhr)).toBe('{"errorText":"busy"}');
  });

  it("returns empty string for unsupported or empty arraybuffer responses", () => {
    expect(
      readXhrBodyAsText(
        fakeXhr({ responseType: "arraybuffer", response: null })
      )
    ).toBe("");
    expect(
      readXhrBodyAsText(fakeXhr({ responseType: "blob", response: {} }))
    ).toBe("");
  });
});
