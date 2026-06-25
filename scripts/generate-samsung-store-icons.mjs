#!/usr/bin/env node
/**
 * Generate Samsung TV Seller Office icon assets.
 *
 * Output: tv-apps/assets/samsung-icons/
 *   samsung-logo-1920x1080.png   — transparent PNG, logo centered (≤300 KB)
 *   samsung-background-1920x1080.jpg — background layer (≤300 KB)
 *   samsung-icon-512x423.png     — legacy TV icon (≤300 KB)
 *
 * Run: npm run tv:store:samsung-icons
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tv-apps/assets/samsung-icons");
const ICON_SRC = path.join(ROOT, "tv-apps/tizen/icon.png");
const MAX_BYTES = 300 * 1024;

const BG_CSS = `
  margin: 0;
  width: 1920px;
  height: 1080px;
  background:
    radial-gradient(ellipse 90% 80% at 78% 35%, rgba(0, 224, 198, 0.35) 0%, transparent 55%),
    radial-gradient(ellipse 70% 70% at 22% 72%, rgba(124, 92, 255, 0.45) 0%, transparent 52%),
    linear-gradient(145deg, #0b0d14 0%, #12151f 42%, #06070b 100%);
`;

async function writeUnderLimit(buffer, outPath, rewrite) {
  let buf = buffer;
  if (buf.length <= MAX_BYTES) {
    await fs.writeFile(outPath, buf);
    return buf.length;
  }
  if (rewrite) {
    buf = await rewrite(buf);
    await fs.writeFile(outPath, buf);
    return buf.length;
  }
  await fs.writeFile(outPath, buf);
  console.warn(`  ⚠ ${path.basename(outPath)} is ${(buf.length / 1024).toFixed(1)} KB (target ≤300 KB)`);
  return buf.length;
}

async function main() {
  const iconBuf = await fs.readFile(ICON_SRC);
  const iconB64 = iconBuf.toString("base64");
  await fs.mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1) Background 1920×1080 JPG
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.setContent(`<!DOCTYPE html><html><body style="${BG_CSS}"></body></html>`);
  let quality = 90;
  let bgBuf;
  do {
    bgBuf = await page.screenshot({ type: "jpeg", quality, fullPage: false });
    quality -= 5;
  } while (bgBuf.length > MAX_BYTES && quality >= 55);
  const bgPath = path.join(OUT, "samsung-background-1920x1080.jpg");
  await fs.writeFile(bgPath, bgBuf);
  console.log(`  ✓ samsung-background-1920x1080.jpg — ${(bgBuf.length / 1024).toFixed(1)} KB`);

  // 2) Logo layer 1920×1080 transparent PNG (logo ≤512×423 safe zone)
  await page.setContent(`<!DOCTYPE html>
<html>
  <body style="margin:0;width:1920px;height:1080px;background:transparent;display:flex;align-items:center;justify-content:center;">
    <img src="data:image/png;base64,${iconB64}" width="400" height="400" alt="" style="display:block;filter:drop-shadow(0 24px 48px rgba(0,0,0,0.45));" />
  </body>
</html>`);
  let logoBuf = await page.screenshot({
    type: "png",
    fullPage: false,
    omitBackground: true,
  });
  const logoPath = path.join(OUT, "samsung-logo-1920x1080.png");
  await writeUnderLimit(logoBuf, logoPath);
  console.log(`  ✓ samsung-logo-1920x1080.png — ${(logoBuf.length / 1024).toFixed(1)} KB`);

  // 3) Full-color 512×423 PNG (2015 TVs + reference composite)
  await page.setViewportSize({ width: 512, height: 423 });
  await page.setContent(`<!DOCTYPE html>
<html>
  <body style="${BG_CSS.replace("1920px", "512px").replace("1080px", "423px")}display:flex;align-items:center;justify-content:center;">
    <img src="data:image/png;base64,${iconB64}" width="200" height="200" alt="" style="display:block;filter:drop-shadow(0 8px 20px rgba(0,0,0,0.4));" />
  </body>
</html>`);
  const icon423Path = path.join(OUT, "samsung-icon-512x423.png");
  const icon423Buf = await page.screenshot({ type: "png", fullPage: false });
  await writeUnderLimit(icon423Buf, icon423Path);
  console.log(`  ✓ samsung-icon-512x423.png — ${(icon423Buf.length / 1024).toFixed(1)} KB`);

  await browser.close();

  const readme = `# Samsung TV store icons

Upload these in **Seller Office → App Images → Icon Images**.

| File | Where to upload | Spec |
|------|-----------------|------|
| \`samsung-logo-1920x1080.png\` | **Logo asset with transparency** | 1920×1080, 32-bit PNG RGBA, ≤300 KB |
| \`samsung-background-1920x1080.jpg\` | **Background image** | 1920×1080, JPG, ≤300 KB |
| \`samsung-icon-512x423.png\` | **512×423 full color asset** | PNG, ≤300 KB |

Samsung composites the logo + background into 16:9 and 1:1 launcher icons automatically.

Regenerate: \`npm run tv:store:samsung-icons\`
`;
  await fs.writeFile(path.join(OUT, "README.md"), readme);
  console.log(`\nIcons ready → ${OUT}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
