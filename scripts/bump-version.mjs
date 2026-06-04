#!/usr/bin/env node
/**
 * Bump package.json semver from conventional commits since the last v* tag.
 *
 *   patch — fix, perf, refactor, revert, chore, docs, style, build, ci, deploy
 *   minor — feat
 *   major — BREAKING CHANGE or type! in subject
 *
 * Usage:
 *   node scripts/bump-version.mjs          # write package.json + build-meta.json
 *   node scripts/bump-version.mjs --dry-run
 *
 * Skip: SKIP_VERSION_BUMP=1
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");

function readPkg() {
  return JSON.parse(readFileSync(pkgPath, "utf8"));
}

function parseSemver(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return { major: 0, minor: 1, patch: 0 };
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function bumpSemver(current, level) {
  const v = parseSemver(current);
  if (level === "major") return formatSemver({ major: v.major + 1, minor: 0, patch: 0 });
  if (level === "minor") return formatSemver({ major: v.major, minor: v.minor + 1, patch: 0 });
  if (level === "patch") return formatSemver({ major: v.major, minor: v.minor, patch: v.patch + 1 });
  return current;
}

function tagExists(tag) {
  if (!tag) return false;
  try {
    execSync(`git rev-parse "${tag}^{tag}"`, {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function lastVersionTag() {
  try {
    return execSync('git describe --tags --abbrev=0 --match "v*"', {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/** Prefer a tag for the current package version so redeploys do not re-bump. */
function baselineTag(currentVersion) {
  const exact = `v${currentVersion}`;
  if (tagExists(exact)) return exact;
  return lastVersionTag();
}

function commitsSince(ref) {
  const range = ref ? `${ref}..HEAD` : "HEAD";
  try {
    const raw = execSync(`git log ${range} --format=%s%n%b%n----`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return raw
      .split("----")
      .map((b) => b.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function bumpLevelForCommit(block) {
  const subject = block.split("\n")[0]?.trim() ?? "";
  if (!subject) return "none";
  if (/BREAKING CHANGE/i.test(block) || /^[a-z]+(\([^)]+\))?!:/i.test(subject)) {
    return "major";
  }
  if (/^feat(\([^)]+\))?:/i.test(subject)) return "minor";
  if (
    /^(fix|perf|refactor|revert|deploy)(\([^)]+\))?:/i.test(subject)
  ) {
    return "patch";
  }
  if (
    /^(chore|docs|style|build|ci|test)(\([^)]+\))?:/i.test(subject)
  ) {
    return "patch";
  }
  return "none";
}

function maxLevel(a, b) {
  const rank = { none: 0, patch: 1, minor: 2, major: 3 };
  return rank[a] >= rank[b] ? a : b;
}

function analyzeCommits(commits) {
  let level = "none";
  for (const c of commits) {
    level = maxLevel(level, bumpLevelForCommit(c));
  }
  if (level === "none" && commits.length > 0) level = "patch";
  return level;
}

function gitShortSha() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const dryRun = process.argv.includes("--dry-run");
if (process.env.SKIP_VERSION_BUMP === "1") {
  console.log("SKIP_VERSION_BUMP=1 — version unchanged");
  process.exit(0);
}

const pkg = readPkg();
const current = pkg.version ?? "0.1.0";
const tag = baselineTag(current);
const commits = commitsSince(tag);

if (commits.length === 0) {
  console.log(`No commits since ${tag || "first commit"} — staying at ${current}`);
  process.exit(0);
}

const level = analyzeCommits(commits);
if (level === "none") {
  console.log(`No semver bump from ${commits.length} commit(s) — staying at ${current}`);
  process.exit(0);
}

const next = bumpSemver(current, level);
const sha = gitShortSha();

console.log(
  `Version ${current} → ${next} (${level}) — ${commits.length} commit(s) since ${tag || "start"}`
);

if (dryRun) process.exit(0);

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const metaPath = path.join(root, "build-meta.json");
writeFileSync(
  metaPath,
  `${JSON.stringify(
    {
      version: next,
      sha,
      bumpedAt: new Date().toISOString(),
      bumpLevel: level,
      commitsSinceTag: commits.length,
      sinceTag: tag || null,
    },
    null,
    2
  )}\n`
);

console.log(`Wrote ${path.relative(root, pkgPath)} and build-meta.json`);
