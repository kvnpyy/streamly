/**
 * Daily TMDB trending sync for discovery shelves (per country).
 *
 * Usage:
 *   npx tsx scripts/sync-tmdb-trending.ts
 *   DISCOVERY_REGIONS=US,GB,AU,MX npx tsx scripts/sync-tmdb-trending.ts
 *
 * Requires TMDB_API_TOKEN and DATABASE_URL (or default data/stream.db).
 */

import { syncTmdbTrendingToDb } from "../src/lib/discovery/tmdb-sync";

const DEFAULT_REGIONS = ["US", "GB", "AU", "MX", "IN", "AE"];

async function main() {
  const raw = process.env.DISCOVERY_REGIONS?.trim();
  const regions = raw
    ? raw.split(/[\s,]+/).map((r) => r.trim().toUpperCase()).filter(Boolean)
    : process.env.DISCOVERY_REGION?.trim()
      ? [process.env.DISCOVERY_REGION.trim().toUpperCase()]
      : DEFAULT_REGIONS;

  for (const region of regions) {
    const result = await syncTmdbTrendingToDb(region);
    if (!result) {
      console.error("TMDB_API_TOKEN is not set — skipping sync.");
      process.exit(1);
    }
    console.log(
      `[discovery] synced TMDB trending for ${result.region}: ` +
        `${result.movieCount} movies, ${result.tvCount} TV at ${result.syncedAt.toISOString()}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
