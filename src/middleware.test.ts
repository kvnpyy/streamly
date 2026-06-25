import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

describe("middleware TV landing", () => {
  it("redirects TV user agents from / to /app", () => {
    const req = new NextRequest("https://iptvwebplayer.org/", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/94.0.4606.128 Safari/537.36 WebAppManager",
      },
    });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://iptvwebplayer.org/app");
  });

  it("does not redirect desktop browsers on /", () => {
    const req = new NextRequest("https://iptvwebplayer.org/", {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});
