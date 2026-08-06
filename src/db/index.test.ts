import { __resetDbCacheForTests, getDb } from "@/db";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dbPath = "";

beforeEach(() => {
  __resetDbCacheForTests();
  dbPath = path.join(
    os.tmpdir(),
    `streamly-db-init-${Date.now()}-${Math.random()}.db`
  );
  process.env.DATABASE_URL = `file:${dbPath}`;
});

afterEach(() => {
  __resetDbCacheForTests();
  delete process.env.DATABASE_URL;
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    for (const suffix of ["-wal", "-shm"]) {
      const side = `${dbPath}${suffix}`;
      if (fs.existsSync(side)) fs.unlinkSync(side);
    }
  }
});

function tableNames(file: string): string[] {
  const driver = new Database(file, { readonly: true });
  try {
    const rows = driver
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  } finally {
    driver.close();
  }
}

describe("getDb startup schema", () => {
  it("creates core auth tables on a fresh empty database", () => {
    getDb();
    __resetDbCacheForTests();

    const tables = tableNames(dbPath);
    expect(tables).toEqual(
      expect.arrayContaining([
        "users",
        "auth_tokens",
        "iptv_provider_accounts",
        "user_provider_favorites",
        "user_provider_watch_state",
        "tv_pair_codes",
        "tv_pair_redeem_buckets",
      ])
    );
  });

  it("is idempotent when tables already exist", () => {
    getDb();
    __resetDbCacheForTests();
    getDb();
    __resetDbCacheForTests();

    expect(tableNames(dbPath)).toContain("users");
  });
});
