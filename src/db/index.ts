import * as schema from "@/db/schema";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/** Drizzle's inferred DB type omits `$client`; runtime exposes it (driver typings). */
type DrizzleWithClient = BetterSQLite3Database<typeof schema> & {
  $client: InstanceType<typeof Database>;
};

function resolveSqliteFilePath(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (raw?.startsWith("file:")) {
    const p = raw.slice("file:".length);
    return path.isAbsolute(p)
      ? p
      : path.join(/* turbopackIgnore: true */ process.cwd(), p);
  }
  return path.join(/* turbopackIgnore: true */ process.cwd(), "data", "stream.db");
}

type ColumnInfo = { name: string };

/**
 * Ensure core tables exist and append any missing columns on the live SQLite DB.
 *
 * Fresh Docker / self-host volumes previously got an empty `stream.db` (file created
 * on open) without `users` — signup then 500'd. `CREATE TABLE IF NOT EXISTS` here
 * matches `src/db/schema.ts` so first boot works without a separate `db:push`.
 *
 * SQLite has no "ALTER TABLE ADD COLUMN IF NOT EXISTS"; we check via PRAGMA
 * table_info. Only nullable / default-bearing columns (all SQLite allows via ALTER).
 */
function runStartupMigrations(driver: InstanceType<typeof Database>): void {
  const tableExists = (table: string): boolean => {
    const row = driver
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
      )
      .get(table) as { name: string } | undefined;
    return Boolean(row);
  };

  const addIfMissing = (table: string, column: string, definition: string) => {
    if (!tableExists(table)) return;
    const cols = driver.pragma(`table_info(${table})`) as ColumnInfo[];
    if (!cols.some((c) => c.name === column)) {
      driver.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
      console.log(`[db:migrate] added column ${table}.${column}`);
    }
  };

  // Core auth / account tables (must exist before signup and provider sync).
  driver.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT,
      email_verified_at INTEGER,
      marketing_opt_in INTEGER NOT NULL DEFAULT 0,
      marketing_opt_in_at INTEGER,
      marketing_unsubscribed_at INTEGER,
      welcome_email_sent_at INTEGER,
      active_iptv_provider_account_id TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  driver.exec(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  driver.exec(`
    CREATE TABLE IF NOT EXISTS iptv_provider_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  driver.exec(`
    CREATE TABLE IF NOT EXISTS user_provider_favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_account_key TEXT NOT NULL,
      favorites_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, provider_account_key)
    );
  `);

  driver.exec(`
    CREATE TABLE IF NOT EXISTS user_provider_watch_state (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_account_key TEXT NOT NULL,
      recents_json TEXT NOT NULL,
      vod_resume_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, provider_account_key)
    );
  `);

  driver.exec(`
    CREATE TABLE IF NOT EXISTS discovery_tmdb_cache (
      id TEXT PRIMARY KEY NOT NULL,
      region TEXT NOT NULL DEFAULT 'US',
      media_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  driver.exec(`
    CREATE TABLE IF NOT EXISTS discovery_sports_cache (
      id TEXT PRIMARY KEY NOT NULL,
      region TEXT NOT NULL DEFAULT 'US',
      payload_json TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  driver.exec(`
    CREATE TABLE IF NOT EXISTS tv_pair_codes (
      pin TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  driver.exec(`
    CREATE TABLE IF NOT EXISTS tv_pair_redeem_buckets (
      ip TEXT PRIMARY KEY NOT NULL,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    );
  `);

  // Columns added after the initial users schema (existing DBs).
  addIfMissing("users", "email_verified_at",              "INTEGER");
  addIfMissing("users", "marketing_opt_in",               "INTEGER NOT NULL DEFAULT 0");
  addIfMissing("users", "marketing_opt_in_at",            "INTEGER");
  addIfMissing("users", "marketing_unsubscribed_at",      "INTEGER");
  addIfMissing("users", "welcome_email_sent_at",          "INTEGER");
  addIfMissing("users", "active_iptv_provider_account_id", "TEXT");
}

/** @internal Vitest only — clears the singleton between test files. */
export function __resetDbCacheForTests(): void {
  cached = undefined;
}

let cached: BetterSQLite3Database<typeof schema> | undefined;

/** Lazily opens SQLite so `next build` doesn't touch the filesystem during bundling. */
export function getDb() {
  if (cached) return cached;
  const filePath = resolveSqliteFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const driver = new Database(filePath);
  driver.pragma("journal_mode = WAL");
  driver.pragma("foreign_keys = ON");
  runStartupMigrations(driver);
  cached = drizzle(driver, { schema });
  return cached;
}

/** Lightweight connectivity check for `/api/health`. */
export function pingSqlite(): boolean {
  try {
    const conn = getDb() as DrizzleWithClient;
    conn.$client.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}
