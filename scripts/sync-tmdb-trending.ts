/**
 * Daily TMDB trending sync for discovery shelves.
 *
 * Usage:
 *   npx tsx scripts/sync-tmdb-trending.ts
 *   DISCOVERY_REGION=UK npx tsx scripts/sync-tmdb-trending.ts
 *
 * Requires TMDB_API_TOKEN and DATABASE_URL (or default data/stream.db).
 */

import { syncTmdbTrendingToDb } from "../src/lib/discovery/tmdb-sync";

async function main() {
  const region = process.env.DISCOVERY_REGION?.trim() || "US";
  const result = await syncTmdbTrendingToDb(region);
  if (!result) {
    console.error("TMDB_API_TOKEN is not set — skipping sync.");
    process.exit(1);
  }
  console.log(
    `[discovery] synced TMDB trending for ${result.region}: ` +
      `${result.movieCount} movies, ${result.tvCount} TV shows at ${result.syncedAt.toISOString()}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
