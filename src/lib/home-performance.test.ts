import { describe, expect, it } from "vitest";
import { isHomeAutoRichDisabledForHints } from "./home-performance";

describe("isHomeAutoRichDisabledForHints", () => {
  it("disables auto-rich on mobile shell width", () => {
    expect(
      isHomeAutoRichDisabledForHints({
        mobileShell: true,
        finePointer: false,
        desktopWidth: false,
      })
    ).toBe(true);
  });

  it("disables auto-rich on desktop fine pointer", () => {
    expect(
      isHomeAutoRichDisabledForHints({
        mobileShell: false,
        finePointer: true,
        desktopWidth: true,
      })
    ).toBe(true);
  });

  it("allows auto-rich on tablet landscape with coarse pointer", () => {
    expect(
      isHomeAutoRichDisabledForHints({
        mobileShell: false,
        finePointer: false,
        desktopWidth: true,
        livingRoom: false,
      })
    ).toBe(false);
  });

  it("respects NEXT_PUBLIC_HOME_AUTO_RICH=0", () => {
    expect(isHomeAutoRichDisabledForHints({ env: "0" })).toBe(true);
  });
});
