import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  FIRE_TV_WIDE_LAYOUT_PX,
  fireTvLayoutWidth,
  fireTvViewportBootScript,
  fireTvViewportContent,
  isFireTvBrowserUa,
  resolveFireTvViewport,
} from "./fire-tv-viewport";

const FIRE_STICK_UA =
  "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS769.4006N) AppleWebKit/537.36 (KHTML, like Gecko) Silk/92.2.11 like Chrome/92.0.4515.159 Safari/537.36";

const FIRE_TABLET_UA =
  "Mozilla/5.0 (Linux; Android 9; KFMAWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/80.5.3 like Chrome/80.0.3987.162 Safari/537.36";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

describe("isFireTvBrowserUa", () => {
  it("matches Fire Stick and Fire TV Silk, not tablets or desktop", () => {
    expect(isFireTvBrowserUa(FIRE_STICK_UA)).toBe(true);
    expect(
      isFireTvBrowserUa(
        "Mozilla/5.0 (Linux; Android 11; AFTKA) Silk/108.2.11 like Chrome/108.0.5359.129 Safari/537.36"
      )
    ).toBe(true);
    expect(isFireTvBrowserUa(FIRE_TABLET_UA)).toBe(false);
    expect(isFireTvBrowserUa(DESKTOP_UA)).toBe(false);
    expect(isFireTvBrowserUa("")).toBe(false);
  });
});

describe("resolveFireTvViewport", () => {
  it("pins a narrow Fire TV layout to the panel and locks pinch zoom", () => {
    expect(fireTvLayoutWidth(960)).toBe(FIRE_TV_WIDE_LAYOUT_PX);
    expect(fireTvLayoutWidth(1920)).toBe(1920);
    expect(fireTvLayoutWidth(1280)).toBe(1280);
    expect(fireTvLayoutWidth(1470)).toBe(1920);
    expect(fireTvLayoutWidth(3840)).toBe(1920);

    const next = resolveFireTvViewport({
      ua: FIRE_STICK_UA,
      innerWidth: 960,
      screenWidth: 1920,
      currentContent: "width=device-width, initial-scale=1",
    });
    expect(next).toBe(fireTvViewportContent(1920));
    expect(next).toContain("width=1920");
    expect(next).toContain("maximum-scale=1");
    expect(next).toContain("user-scalable=no");
  });

  it("uses the 720p panel width when Silk reports it", () => {
    expect(
      resolveFireTvViewport({
        ua: FIRE_STICK_UA,
        innerWidth: 640,
        screenWidth: 1280,
        currentContent: "width=device-width, initial-scale=1",
      })
    ).toBe(fireTvViewportContent(1280));
  });

  it("leaves an already locked Fire TV viewport alone", () => {
    const locked = fireTvViewportContent(1920);
    expect(
      resolveFireTvViewport({
        ua: FIRE_STICK_UA,
        innerWidth: 1920,
        screenWidth: 1920,
        currentContent: locked,
      })
    ).toBeNull();
  });

  it("does not resize Fire tablets or desktop browsers", () => {
    expect(
      resolveFireTvViewport({
        ua: FIRE_TABLET_UA,
        innerWidth: 800,
        screenWidth: 1200,
        currentContent: "width=device-width, initial-scale=1",
      })
    ).toBeNull();
    expect(
      resolveFireTvViewport({
        ua: DESKTOP_UA,
        innerWidth: 1440,
        screenWidth: 1440,
        currentContent: "width=device-width, initial-scale=1",
      })
    ).toBeNull();
  });
});

describe("fireTvViewportBootScript", () => {
  it("rewrites the viewport meta the same way as the helper", () => {
    const script = fireTvViewportBootScript();
    const meta = {
      content: "width=device-width, initial-scale=1",
      getAttribute(name: string) {
        return name === "content" ? this.content : null;
      },
      setAttribute(name: string, value: string) {
        if (name === "content") this.content = value;
      },
    };
    const document = {
      querySelector(sel: string) {
        return sel === 'meta[name="viewport"]' ? meta : null;
      },
      head: { appendChild() {} },
      documentElement: { appendChild() {} },
      createElement() {
        return meta;
      },
    };
    runInNewContext(script, {
      document,
      navigator: { userAgent: FIRE_STICK_UA },
      window: { innerWidth: 960, screen: { width: 1920 } },
    });
    expect(meta.content).toBe(
      resolveFireTvViewport({
        ua: FIRE_STICK_UA,
        innerWidth: 960,
        screenWidth: 1920,
        currentContent: "width=device-width, initial-scale=1",
      })
    );
  });
});
