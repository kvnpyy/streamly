import { describe, expect, it } from "vitest";
import {
  isThirdPartyScriptFrame,
  shouldDropSentryClientEvent,
} from "./sentry-noise-filter";

describe("isThirdPartyScriptFrame", () => {
  it("detects userscript and extension URLs", () => {
    expect(isThirdPartyScriptFrame("app:///videoplayer.user.js")).toBe(true);
    expect(isThirdPartyScriptFrame("chrome-extension://abc/content.js")).toBe(
      true
    );
    expect(isThirdPartyScriptFrame("moz-extension://abc/script.js")).toBe(true);
  });

  it("allows first-party app frames", () => {
    expect(
      isThirdPartyScriptFrame("https://iptvwebplayer.org/_next/static/chunks/app.js")
    ).toBe(false);
    expect(
      isThirdPartyScriptFrame("./src/app/login/page.tsx")
    ).toBe(false);
  });
});

describe("shouldDropSentryClientEvent", () => {
  it("drops errors with only third-party stack frames", () => {
    const drop = shouldDropSentryClientEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "app:///videoplayer.user.js",
                  lineno: 42,
                  in_app: false,
                },
              ],
            },
          },
        ],
      },
    });
    expect(drop).toBe(true);
  });

  it("keeps errors that include in-app frames", () => {
    const drop = shouldDropSentryClientEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "app:///videoplayer.user.js",
                  in_app: false,
                },
                {
                  filename: "https://iptvwebplayer.org/_next/static/chunks/123.js",
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
    });
    expect(drop).toBe(false);
  });
});
