import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enforceXtreamAuthProbeCaptcha } from "./xtream-captcha";

describe("enforceXtreamAuthProbeCaptcha", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips Turnstile for TV-class user agents (Tizen / Samsung TV)", async () => {
    vi.stubEnv("STREAM_TURNSTILE_SECRET_KEY", "0".repeat(32));
    const req = new NextRequest("http://localhost/api/xtream", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (SMART-TV; LINUX; Tizen 9.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/8.0 TV Safari/537.36",
      },
    });
    const block = await enforceXtreamAuthProbeCaptcha(
      req,
      { server: "http://example.com", username: "u", password: "p" },
      null
    );
    expect(block).toBeNull();
  });
});
