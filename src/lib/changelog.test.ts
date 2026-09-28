import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG, getLatestChangelogEntry, groupChangelogByMonth, CHANGELOG_RECENT_VISIBLE } from "@/lib/changelog";

function parsePatch(version: string): { major: number; minor: number; patch: number } {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`invalid semver: ${version}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** predeploy may bump package.json one patch ahead of the latest changelog entry. */
function changelogAlignedWithPackage(pkgVersion: string, latestChangelog: string): boolean {
  if (pkgVersion === latestChangelog) return true;
  const pkg = parsePatch(pkgVersion);
  const cl = parsePatch(latestChangelog);
  return (
    pkg.major === cl.major &&
    pkg.minor === cl.minor &&
    pkg.patch === cl.patch + 1
  );
}

describe("changelog", () => {
  it("latest entry aligns with package.json version", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { version: string };
    expect(
      changelogAlignedWithPackage(pkg.version, getLatestChangelogEntry().version)
    ).toBe(true);
  });

  it("entries are newest-first", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      const prev = new Date(CHANGELOG[i - 1].date).getTime();
      const cur = new Date(CHANGELOG[i].date).getTime();
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });

  it("groups older releases by month without dropping entries", () => {
    const older = CHANGELOG.slice(CHANGELOG_RECENT_VISIBLE);
    const groups = groupChangelogByMonth(older);
    const count = groups.reduce((n, group) => n + group.entries.length, 0);
    expect(count).toBe(older.length);
    expect(groups.length).toBeGreaterThan(1);
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1].key >= groups[i].key).toBe(true);
    }
    expect(groups[0]?.label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
  });
});
