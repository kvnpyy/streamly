import { describe, expect, it } from "vitest";
import {
  isThirdPartyScriptFrame,
  shouldDropSentryClientEvent,
  shouldDropSentryException,
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

  it("drops Next.js RSC client-manifest mismatches after a deploy", () => {
    expect(
      shouldDropSentryException(
        "Error",
        'Could not find the module "/opt/stream/iptv-player/node_modules/next/dist/lib/framework/boundary-components.js#ViewportBoundary" in the React Client Manifest. This is probably a bug in the React Server Components bundler.'
      )
    ).toBe(true);
    expect(
      shouldDropSentryException(
        "Error",
        'Could not find the module "/opt/stream/iptv-player/node_modules/next/dist/lib/metadata/generate/icon-mark.js#IconMark" in the React Client Manifest.'
      )
    ).toBe(true);
  });

  it("drops browser-extension removeChild races and Safari network Load failed", () => {
    expect(
      shouldDropSentryException(
        "NotFoundError",
        "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
      )
    ).toBe(true);
    expect(
      shouldDropSentryException("TypeError", "Load failed (iptvwebplayer.org)")
    ).toBe(true);
  });

  it("keeps application errors", () => {
    expect(
      shouldDropSentryException(
        "Error",
        "Maximum update depth exceeded. This can happen when a component repeatedly calls setState"
      )
    ).toBe(false);
  });
});
