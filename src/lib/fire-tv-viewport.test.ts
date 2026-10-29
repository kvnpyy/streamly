import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  FIRE_TV_DEVICE_VIEWPORT,
  FIRE_TV_WIDE_LAYOUT_PX,
  fireTvFitZoom,
  fireTvLayoutWidth,
  fireTvViewportBootScript,
  isFireTvBrowserUa,
  resolveFireTvViewport,
} from "./fire-tv-viewport";

const FIRE_STICK_UA =
  "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS769.4006N) AppleWebKit/537.36 (KHTML, like Gecko) Silk/92.2.11 like Chrome/92.0.4515.159 Safari/537.36";

const FIRE_TABLET_UA =
  "Mozilla/5.0 (Linux; Android 9; KFMAWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/80.5.3 like Chrome/80.0.3987.162 Safari/537.36";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

const LOCKED_1920 =
  "width=1920, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

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
  it("drops the locked 1920px scale that keeps Silk zoomed in", () => {
    expect(fireTvLayoutWidth(960)).toBe(FIRE_TV_WIDE_LAYOUT_PX);
    expect(
      resolveFireTvViewport({
        ua: FIRE_STICK_UA,
        innerWidth: 960,
        screenWidth: 1920,
        currentContent: LOCKED_1920,
      })
    ).toBe(FIRE_TV_DEVICE_VIEWPORT);
  });

  it("leaves a normal device-width viewport alone", () => {
    expect(
      resolveFireTvViewport({
        ua: FIRE_STICK_UA,
        innerWidth: 960,
        screenWidth: 1920,
        currentContent: FIRE_TV_DEVICE_VIEWPORT,
      })
    ).toBeNull();
  });

  it("does not resize Fire tablets or desktop browsers", () => {
    expect(
      resolveFireTvViewport({
        ua: FIRE_TABLET_UA,
        innerWidth: 800,
        screenWidth: 1200,
        currentContent: LOCKED_1920,
      })
    ).toBeNull();
    expect(
      resolveFireTvViewport({
        ua: DESKTOP_UA,
        innerWidth: 1440,
        screenWidth: 1440,
        currentContent: LOCKED_1920,
      })
    ).toBeNull();
  });
});

describe("fireTvFitZoom", () => {
  it("halves a 960px Silk layout on a 1080p panel", () => {
    expect(
      fireTvFitZoom({
        ua: FIRE_STICK_UA,
        innerWidth: 960,
        screenWidth: 1920,
      })
    ).toBe(0.5);
  });

  it("does not shrink a layout that is already panel-sized", () => {
    expect(
      fireTvFitZoom({
        ua: FIRE_STICK_UA,
        innerWidth: 1920,
        screenWidth: 1920,
      })
    ).toBeNull();
    expect(
      fireTvFitZoom({
        ua: FIRE_TABLET_UA,
        innerWidth: 800,
        screenWidth: 1200,
      })
    ).toBeNull();
  });
});

describe("fireTvViewportBootScript", () => {
  it("rewrites a locked 1920 viewport back to device-width", () => {
    const script = fireTvViewportBootScript();
    const meta = {
      content: LOCKED_1920,
      getAttribute(name: string) {
        return name === "content" ? this.content : null;
      },
      setAttribute(name: string, value: string) {
        if (name === "content") this.content = value;
      },
    };
    const root = { style: { zoom: "", width: "" } };
    const document = {
      querySelector(sel: string) {
        return sel === 'meta[name="viewport"]' ? meta : null;
      },
      head: { appendChild() {} },
      documentElement: root,
      createElement() {
        return meta;
      },
    };
    runInNewContext(script, {
      document,
      navigator: { userAgent: FIRE_STICK_UA },
      window: { innerWidth: 960, screen: { width: 1920 } },
    });
    expect(meta.content).toBe(FIRE_TV_DEVICE_VIEWPORT);
    expect(root.style.zoom).toBe("0.5");
    expect(root.style.width).toBe("200%");
  });
});
