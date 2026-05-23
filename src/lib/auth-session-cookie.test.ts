import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  decodeSessionCookiePayload,
  encodeLegacyPlainSessionCookie,
  encodeSessionCookiePayload,
  parseCredentialsFromSessionJson,
  SessionCookieEncodeError,
  SESSION_COOKIE_V2_PREFIX,
} from "./auth-session-cookie";

const sampleCreds = {
  server: "http://example.com:8080",
  username: "user1",
  password: "secret-pass",
};

describe("parseCredentialsFromSessionJson", () => {
  it("parses valid envelope", () => {
    const json = JSON.stringify({ creds: sampleCreds });
    expect(parseCredentialsFromSessionJson(json)).toEqual({
      server: "http://example.com:8080",
      username: "user1",
      password: "secret-pass",
    });
  });

  it("trims server and username", () => {
    const json = JSON.stringify({
      creds: { ...sampleCreds, server: "  http://x  ", username: "  u  " },
    });
    expect(parseCredentialsFromSessionJson(json)).toMatchObject({
      server: "http://x",
      username: "u",
    });
  });

  it("returns null for malformed json", () => {
    expect(parseCredentialsFromSessionJson("not-json")).toBeNull();
  });
});

describe("legacy plain cookie", () => {
  it("decodeSessionCookiePayload reads legacy base64url blob", () => {
    const legacy = encodeLegacyPlainSessionCookie(sampleCreds);
    expect(legacy.startsWith(SESSION_COOKIE_V2_PREFIX)).toBe(false);
    expect(decodeSessionCookiePayload(legacy)).toEqual({
      server: "http://example.com:8080",
      username: "user1",
      password: "secret-pass",
    });
  });
});

describe("v2 encrypted cookie", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STREAM_SESSION_SECRET", "test-session-secret-at-least-16");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("roundtrips credentials", () => {
    const encoded = encodeSessionCookiePayload(sampleCreds);
    expect(encoded.startsWith(SESSION_COOKIE_V2_PREFIX)).toBe(true);
    expect(decodeSessionCookiePayload(encoded)).toEqual(sampleCreds);
  });

  it("wrong secret fails decrypt", () => {
    const encoded = encodeSessionCookiePayload(sampleCreds);
    vi.stubEnv("STREAM_SESSION_SECRET", "different-secret-at-least-16");
    expect(decodeSessionCookiePayload(encoded)).toBeNull();
  });

  it("tampered ciphertext fails decrypt", () => {
    const encoded = encodeSessionCookiePayload(sampleCreds);
    const payload = encoded.slice(SESSION_COOKIE_V2_PREFIX.length);
    const buf = Buffer.from(payload, "base64url");
    if (buf.length > 40) buf[40] ^= 0xff;
    else buf[buf.length - 1] ^= 0xff;
    const corrupted =
      SESSION_COOKIE_V2_PREFIX + buf.toString("base64url");
    expect(decodeSessionCookiePayload(corrupted)).toBeNull();
  });
});

describe("production SessionCookieEncodeError", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STREAM_SESSION_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encodeSessionCookiePayload throws when secret missing", () => {
    expect(() => encodeSessionCookiePayload(sampleCreds)).toThrow(
      SessionCookieEncodeError
    );
  });
});
