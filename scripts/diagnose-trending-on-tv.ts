/**
 * Run: npx tsx scripts/diagnose-trending-on-tv.ts [North America]
 * Requires IPTV creds in .env.local (IPTV_SERVER, IPTV_USER, IPTV_PASS) or
 * STREAM_TEST_SERVER / STREAM_TEST_USER / STREAM_TEST_PASS.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  diagnoseTrendingOnTvPipeline,
  formatTrendingDiagnoseReport,
} from "../src/lib/discovery/trending-on-tv-diagnose";
import type { TvRegion } from "../src/lib/geo-continent";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function credsFromEnv() {
  const server =
    process.env.STREAM_TEST_SERVER?.trim() ||
    process.env.IPTV_SERVER?.trim() ||
    "";
  const username =
    process.env.STREAM_TEST_USER?.trim() ||
    process.env.IPTV_USER?.trim() ||
    "";
  const password =
    process.env.STREAM_TEST_PASS?.trim() ||
    process.env.IPTV_PASS?.trim() ||
    "";
  if (!server || !username || !password) return null;
  return { server, username, password };
}

async function main() {
  const tvRegion = (process.argv[2] ?? "North America") as TvRegion;
  const creds = credsFromEnv();
  if (!creds) {
    console.error(
      "Missing creds. Set STREAM_TEST_SERVER/USER/PASS or IPTV_SERVER/USER/PASS in .env.local"
    );
    process.exit(1);
  }

  console.log(`\n=== Trending on TV diagnose (${tvRegion}) ===\n`);

  const { buildTrendingOnTvForAccount } = await import(
    "../src/lib/discovery/trending-on-tv-server"
  );
  const { getCachedLiveCatalogEntry } = await import(
    "../src/lib/live-catalog-server-cache"
  );
  const { collectRegionalChannelSample } = await import(
    "../src/lib/live-regional-channel-sample"
  );
  const { pickLiveDiscoveryCandidateIds } = await import(
    "../src/lib/discovery/live-candidates"
  );
  const { mergeTmdbTrendingLists } = await import(
    "../src/lib/discovery/live-trending-on-tv"
  );
  const { readTmdbTrendingFromDb } = await import(
    "../src/lib/discovery/tmdb-sync"
  );
  const { resolveTmdbCountry } = await import(
    "../src/lib/discovery/tmdb-region"
  );

  const tmdbCountry = resolveTmdbCountry({ tvRegion });
  const { bundle, index, streamById } = await getCachedLiveCatalogEntry(creds);
  console.log(
    `catalog: categories=${bundle.categories.length} streams=${bundle.streams.length} indexKeys=${Object.keys(index).length}`
  );

  let regional = collectRegionalChannelSample(
    creds,
    tvRegion,
    bundle,
    index,
    streamById,
    72,
    { maxCategories: 20, perCategory: 8 }
  );
  if (regional.length === 0 && tvRegion !== "All") {
    regional = collectRegionalChannelSample(
      creds,
      "All",
      bundle,
      index,
      streamById,
      72,
      { maxCategories: 20, perCategory: 8 }
    );
    console.log(`regional: 0 for ${tvRegion}, retried All => ${regional.length}`);
  } else {
    console.log(`regional channels: ${regional.length}`);
  }

  const channelById = new Map(regional.map((c) => [c.stream_id, c]));
  const candidateIds = pickLiveDiscoveryCandidateIds(
    [...channelById.values()],
    [],
    [],
    72,
    []
  );

  const snapshots = new Map<number, { nowTitle?: string }>();
  const { fetchNowPlayingTitleForChannel } = await import(
    "../src/lib/epg-server-short"
  );
  const categoryRows = bundle.categories.map((c) => ({
    category_id: c.category_id,
    category_name: c.category_name,
  }));

  const sampleIds = candidateIds.slice(0, 12);
  console.log(`fetching EPG for ${sampleIds.length} sample channels…`);
  for (const id of sampleIds) {
    const ch = channelById.get(id);
    if (!ch) continue;
    const cat = categoryRows.find(
      (c) => String(c.category_id) === String(ch.category_id)
    )?.category_name;
    const title = await fetchNowPlayingTitleForChannel(creds, ch, cat);
    if (title) snapshots.set(id, { nowTitle: title });
  }
  console.log(`sample snapshots with title: ${snapshots.size}`);

  const { movieTrending, tvTrending } = await readTmdbTrendingFromDb(tmdbCountry);
  const tmdb = mergeTmdbTrendingLists(movieTrending, tvTrending);
  console.log(`tmdb ${tmdbCountry}: movies=${movieTrending.length} tv=${tvTrending.length}`);

  const pipeReport = diagnoseTrendingOnTvPipeline({
    candidateIds,
    channelById,
    snapshots,
    tmdbTrending: tmdb,
  });
  console.log("\n--- pipeline (sample EPG only) ---");
  console.log(formatTrendingDiagnoseReport(pipeReport));

  console.log("\n--- full server buildTrendingOnTvForAccount ---");
  const result = await buildTrendingOnTvForAccount(creds, tvRegion, {
    epgHints: [],
  });
  console.log(
    `items=${result.items.length} tmdbCountry=${result.tmdbCountry} cached=${result.cached}`
  );
  for (const e of result.items.slice(0, 8)) {
    console.log(`  - ${e.stream.name} => "${e.programmeTitle}"`);
  }

  if (result.items.length === 0) {
    console.log("\nFAIL: server returned 0 items — see pipeline report above.");
    process.exit(2);
  }
  console.log("\nOK: trending shelf would render.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
