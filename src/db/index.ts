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
 * Add any schema columns that are missing from the live SQLite database.
 * SQLite does not support "ALTER TABLE ADD COLUMN IF NOT EXISTS", so we check
 * via PRAGMA table_info first. Only appends nullable / default-bearing columns
 * (which is all SQLite allows in ALTER TABLE anyway).
 */
function runStartupMigrations(driver: InstanceType<typeof Database>): void {
  const addIfMissing = (table: string, column: string, definition: string) => {
    const cols = driver.pragma(`table_info(${table})`) as ColumnInfo[];
    if (!cols.some((c) => c.name === column)) {
      driver.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
      console.log(`[db:migrate] added column ${table}.${column}`);
    }
  };

  // users — marketing + welcome email columns added after initial schema
  addIfMissing("users", "marketing_opt_in",         "INTEGER NOT NULL DEFAULT 0");
  addIfMissing("users", "marketing_opt_in_at",       "INTEGER");
  addIfMissing("users", "marketing_unsubscribed_at", "INTEGER");
  addIfMissing("users", "welcome_email_sent_at",     "INTEGER");

  driver.exec(`
    CREATE TABLE IF NOT EXISTS user_provider_favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_account_key TEXT NOT NULL,
      favorites_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, provider_account_key)
    );
  `);
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
