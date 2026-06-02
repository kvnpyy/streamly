/**
 * Sync MMA events from BALLDONTLIE into discovery_sports_cache.
 *
 * Prefer cron HTTP (avoids `server-only` when run via tsx):
 *   curl -fsS -X POST http://127.0.0.1:3000/api/discovery/sync-sports
 *
 * CLI (requires Next server context — may fail under tsx):
 *   BALLDONTLIE_API_KEY=... npm run discovery:sync-sports
 */

import { syncSportsEventsToDb } from "../src/lib/discovery/sports-sync";

async function main() {
  const result = await syncSportsEventsToDb(
    process.env.DISCOVERY_REGION?.trim() || "US"
  );
  if (!result) {
    console.error("BALLDONTLIE_API_KEY is not set — skipping sync.");
    process.exit(1);
  }
  console.log(
    `[discovery] synced ${result.eventCount} MMA events for ${result.region} at ${result.syncedAt.toISOString()}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
