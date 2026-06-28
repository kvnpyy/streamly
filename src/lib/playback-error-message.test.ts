import { describe, expect, it } from "vitest";
import {
  humanizePlaybackErrorResponse,
  looksLikeHtmlOrMarkup,
  playbackErrorFallback,
} from "@/lib/playback-error-message";

const CLOUDFLARE_SNIPPET = `<!DOCTYPE html>
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
<html lang="en-US">
<head><title>Attention Required</title></head>
<body></body></html>`;

describe("looksLikeHtmlOrMarkup", () => {
  it("detects HTML error pages", () => {
    expect(looksLikeHtmlOrMarkup(CLOUDFLARE_SNIPPET)).toBe(true);
    expect(looksLikeHtmlOrMarkup("plain provider error")).toBe(false);
  });
});

describe("humanizePlaybackErrorResponse", () => {
  it("replaces HTML bodies with a status fallback", () => {
    expect(
      humanizePlaybackErrorResponse(
        CLOUDFLARE_SNIPPET,
        "fallback",
        502
      )
    ).toBe(playbackErrorFallback(502));
  });

  it("keeps short plain-text API errors", () => {
    expect(
      humanizePlaybackErrorResponse(
        "Your provider returned HTTP 500 for this file.",
        "fallback"
      )
    ).toBe("Your provider returned HTTP 500 for this file.");
  });

  it("parses JSON error payloads", () => {
    expect(
      humanizePlaybackErrorResponse(
        '{"errorText":"Segment not ready yet."}',
        "fallback"
      )
    ).toBe("Segment not ready yet.");
  });

  it("uses fallback for empty bodies", () => {
    expect(humanizePlaybackErrorResponse("", "Try again later.")).toBe(
      "Try again later."
    );
  });
});
