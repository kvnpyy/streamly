import { describe, expect, it } from "vitest";
import { isChromecastReceiverUserAgent } from "./chromecast-ua";
import { isAllowedStreamProxyUserAgent } from "./stream-client-user-agent";

describe("chromecast-ua", () => {
  it("detects CrKey receiver UA", () => {
    const ua =
      "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.225 Safari/537.36 CrKey/1.56.500000 DeviceType/Chromecast";
    expect(isChromecastReceiverUserAgent(ua)).toBe(true);
    expect(isAllowedStreamProxyUserAgent(ua, [])).toBe(true);
  });

  it("rejects empty UA", () => {
    expect(isChromecastReceiverUserAgent("")).toBe(false);
  });
});
