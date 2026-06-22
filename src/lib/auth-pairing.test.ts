import { __resetDbCacheForTests } from "@/db";
import {
  __clearPairingRedeemBucketsForTests,
  issuePairCode,
  pairingRedeemAllowed,
  redeemPairCode,
} from "@/lib/auth-pairing";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_CREDS = {
  server: "http://panel.example.com",
  username: "tvuser",
  password: "secret",
};

let dbPath = "";

beforeEach(() => {
  __resetDbCacheForTests();
  dbPath = path.join(os.tmpdir(), `streamly-pair-test-${Date.now()}-${Math.random()}.db`);
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.STREAM_SESSION_SECRET = "test-session-secret-32chars-min";
});

afterEach(() => {
  __resetDbCacheForTests();
  delete process.env.DATABASE_URL;
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe("issuePairCode / redeemPairCode", () => {
  it("issues a 6-digit pin and redeems once", async () => {
    const pin = await issuePairCode(TEST_CREDS);
    expect(pin).toMatch(/^\d{6}$/);

    const creds = await redeemPairCode(pin);
    expect(creds).toEqual(TEST_CREDS);
    expect(await redeemPairCode(pin)).toBeNull();
  });

  it("rejects invalid pins", async () => {
    await issuePairCode(TEST_CREDS);
    expect(await redeemPairCode("12")).toBeNull();
    expect(await redeemPairCode("000000")).toBeNull();
  });

  it("strips non-digits from redeem input", async () => {
    const pin = await issuePairCode(TEST_CREDS);
    expect(await redeemPairCode(`${pin.slice(0, 3)}-${pin.slice(3)}`)).toEqual(TEST_CREDS);
  });
});

describe("pairingRedeemAllowed", () => {
  it("allows attempts within the window", async () => {
    await __clearPairingRedeemBucketsForTests();
    expect(await pairingRedeemAllowed("203.0.113.1")).toBe(true);
    expect(await pairingRedeemAllowed("203.0.113.1")).toBe(true);
  });
});
