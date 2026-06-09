/**
 * Run: npx tsx scripts/diagnose-247-shelves.ts [North America]
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  categoryHas24_7,
  categoryMatchesRegion,
  getCategoryCountryIso,
  getCategoryRegion,
  streamMatchesRegion,
  type TvRegion,
} from "../src/lib/geo-continent";
import { categoryPassesRegionGate } from "../src/lib/live-category-shelf";
import { getShelfCategoriesForRegion } from "../src/lib/live-catalog-shelf-category-cache";
import { getCachedLiveCatalogEntry } from "../src/lib/live-catalog-server-cache";
import { materializeStreamIds } from "../src/lib/live-catalog-stream-map";
import { lookupStreamIdsForCategory } from "../src/lib/live-stream-index";
import { liveCatalogDiskKey } from "../src/lib/xtream-catalog-disk-cache";
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

function filterPreviewLikeShelfBatch(
  streams: ReturnType<typeof materializeStreamIds>,
  categoryName: string,
  region: TvRegion,
  limit: number
) {
  if (region === "All") return streams.slice(0, limit);
  const catRegion = getCategoryRegion(categoryName);
  if (catRegion !== null && catRegion === region) {
    return streams.slice(0, limit);
  }
  const out: typeof streams = [];
  for (const s of streams) {
    if (out.length >= limit) break;
    if (streamMatchesRegion(s.name, categoryName, region)) out.push(s);
  }
  return out;
}

async function main() {
  const region = (process.argv[2] ?? "North America") as TvRegion;
  const creds = credsFromEnv();
  if (!creds) {
    console.error("Missing IPTV creds in .env.local");
    process.exit(1);
  }

  const { bundle, index, streamById } = await getCachedLiveCatalogEntry(creds);
  const counts = bundle.countByCategoryId ?? {};
  const diskKey = liveCatalogDiskKey(creds);
  const filtered = getShelfCategoriesForRegion(
    diskKey,
    region,
    bundle.categories,
    counts,
    index
  );

  const all247 = bundle.categories.filter((c) =>
    categoryHas24_7(c.category_name)
  );

  console.log(`\n=== 24/7 shelf diagnose (${region}) ===`);
  console.log(`Total categories: ${bundle.categories.length}`);
  console.log(`24/7-named categories: ${all247.length}`);
  console.log(`In region shelf list: ${filtered.filter((c) => categoryHas24_7(c.category_name)).length}`);

  const limit = 7;
  let passGate = 0;
  let withIds = 0;
  let withPreview = 0;
  const failures: string[] = [];

  for (const category of all247.slice(0, 40)) {
    const name = category.category_name;
    const catId = String(category.category_id);
    const gate = categoryPassesRegionGate(name, region);
    const ids = lookupStreamIdsForCategory(index, catId) ?? [];
    const raw = materializeStreamIds(streamById, ids, limit * 6);
    const preview = filterPreviewLikeShelfBatch(raw, name, region, limit);

    if (gate) passGate++;
    else failures.push(`GATE ${name}`);

    if (ids.length) withIds++;
    else failures.push(`NO_IDS ${name} (count=${counts[catId] ?? "?"})`);

    if (preview.length) withPreview++;
    else if (gate && ids.length) {
      failures.push(
        `EMPTY_PREVIEW ${name} region=${getCategoryRegion(name) ?? "generic"} iso=${getCategoryCountryIso(name) ?? "-"} sample=${raw[0]?.name ?? "none"}`
      );
    }
  }

  console.log(`\nFirst 40 24/7 categories:`);
  console.log(`  pass region gate: ${passGate}`);
  console.log(`  have stream ids:  ${withIds}`);
  console.log(`  non-empty preview:${withPreview}`);

  if (failures.length) {
    console.log(`\nFailures (first 15):`);
    for (const f of failures.slice(0, 15)) console.log(`  - ${f}`);
  }

  const sampleNames = [
    "[US] 24/7 ENGLISH MOVIES/SERIES 4K",
    "[US] 24/7 ENGLISH MOVIES",
    "24/7 ENGLISH MOVIES",
  ];
  console.log("\nSynthetic name checks:");
  for (const name of sampleNames) {
    console.log(
      `  ${name} => match=${categoryMatchesRegion(name, region)} region=${getCategoryRegion(name) ?? "generic"}`
    );
    console.log(
      `    [EN] COBRA KAI => streamMatch=${streamMatchesRegion("[EN] COBRA KAI", name, region)}`
    );
  }

  const ranked = filtered.findIndex((c) => categoryHas24_7(c.category_name));
  console.log(
    `\nFirst 24/7 category rank in ${region} browse order: ${ranked >= 0 ? ranked : "not found"} / ${filtered.length}`
  );
  if (ranked >= 0) {
    console.log(`  => ${filtered[ranked]!.category_name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
