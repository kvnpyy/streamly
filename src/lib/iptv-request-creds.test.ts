import { describe, expect, it } from "vitest";

import { readIptvCredsFromRequest } from "@/lib/iptv-request-creds";
import { normalizeServer, tryParseHttpUrl } from "@/lib/utils";

function mockRequest(headers: Record<string, string>) {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  } as Parameters<typeof readIptvCredsFromRequest>[0];
}

describe("normalizeServer", () => {
  it("strips player_api.php suffix", () => {
    expect(normalizeServer("http://host:8080/player_api.php")).toBe(
      "http://host:8080"
    );
  });

  it("strips get.php suffix", () => {
    expect(normalizeServer("https://host/get.php")).toBe("https://host");
  });

  it("tryParseHttpUrl rejects junk that would throw Invalid URL", () => {
    expect(tryParseHttpUrl("http://panel.example.com").href).toBe(
      "http://panel.example.com/"
    );
    expect(tryParseHttpUrl("not a url")).toBeNull();
    expect(tryParseHttpUrl("http://")).toBeNull();
    expect(tryParseHttpUrl("")).toBeNull();
  });
});

describe("readIptvCredsFromRequest", () => {
  it("allows empty password", () => {
    const creds = readIptvCredsFromRequest(
      mockRequest({
        "x-iptv-server": "http://panel.example.com",
        "x-iptv-username": "user",
        "x-iptv-password": "",
      })
    );
    expect(creds).toEqual({
      server: "http://panel.example.com",
      username: "user",
      password: "",
    });
  });

  it("rejects missing password header", () => {
    expect(
      readIptvCredsFromRequest(
        mockRequest({
          "x-iptv-server": "http://panel.example.com",
          "x-iptv-username": "user",
        })
      )
    ).toBeNull();
  });
});
