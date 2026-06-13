#!/usr/bin/env node
/**
 * Manual device QA checklist + optional automated P0 smoke tests.
 *
 * Usage:
 *   node scripts/qa-device-checklist.mjs
 *   P0_TEST_BASE_URL=http://127.0.0.1:3001 node scripts/qa-device-checklist.mjs --run-p0
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const runP0 = process.argv.includes("--run-p0");

const CHECKLIST = [
  {
    device: "iPhone Safari",
    items: [
      "Bottom nav tap targets feel comfortable (Home, Live, Movies, Search, More)",
      "Top bar shows page title + icon playlist switcher",
      "Player: Schedule (EPG) and PiP buttons visible",
      "Live guide usable in portrait and landscape",
    ],
  },
  {
    device: "iPad landscape",
    items: [
      "Uses mobile/desktop shell (sidebar or bottom nav) — not TV shell unless Comfort TV on",
      "Live browse: category rail + list/guide at 1024px breakpoint",
    ],
  },
  {
    device: "Samsung Tizen TV (2022+)",
    items: [
      "Live: List/Guide toggle; guide grid renders",
      "TvTopNav D-pad focus between tabs",
      "Rich home: TvHomeHub shelves + continue row",
      "Movies/Series: shelf-first browse, genre opens grid",
    ],
  },
  {
    device: "Fire TV Silk",
    items: [
      "Player remote hints banner (OK on video, Back, arrows)",
      "Live channel play from guide or shelf",
      "No sidebar; TvTopNav visible",
    ],
  },
];

console.log("\nStreamly device QA checklist\n");
for (const section of CHECKLIST) {
  console.log(`## ${section.device}`);
  for (const item of section.items) {
    console.log(`  [ ] ${item}`);
  }
  console.log("");
}

if (runP0) {
  console.log("Running automated P0 click-through tests…\n");
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "p0-clickthrough.mjs");
  const child = spawn(process.execPath, [script], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  console.log("Tip: add --run-p0 to also run scripts/p0-clickthrough.mjs\n");
}
