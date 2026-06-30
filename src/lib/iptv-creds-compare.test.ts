import { describe, expect, it } from "vitest";
import {
  iptvCredentialsDiffer,
  iptvCredentialsFingerprint,
} from "./iptv-creds-compare";

describe("iptvCredentialsFingerprint", () => {
  it("normalizes server trailing slashes", () => {
    const a = iptvCredentialsFingerprint({
      server: "http://x.com/",
      username: "User",
      password: "p",
    });
    const b = iptvCredentialsFingerprint({
      server: "http://x.com",
      username: "user",
      password: "p",
    });
    expect(a).toBe(b);
  });
});

describe("iptvCredentialsDiffer", () => {
  const base = {
    server: "http://x.com",
    username: "u",
    password: "old",
  };

  it("returns false when either side is missing", () => {
    expect(iptvCredentialsDiffer(null, base)).toBe(false);
    expect(iptvCredentialsDiffer(base, null)).toBe(false);
  });

  it("returns false for equivalent creds", () => {
    expect(
      iptvCredentialsDiffer(base, {
        ...base,
        server: "http://x.com/",
        username: " U ",
      })
    ).toBe(false);
  });

  it("returns true when password differs", () => {
    expect(
      iptvCredentialsDiffer(base, { ...base, password: "new" })
    ).toBe(true);
  });
});
