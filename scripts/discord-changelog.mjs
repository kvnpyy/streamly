/**
 * Build and post one #changelog note per week.
 *
 * Source of truth is CHANGELOG.md (the same notes as iptvwebplayer.org/changelog).
 * Deploys during the week are collected. Friday's job posts them as a single
 * card. Notes that are only internal, or that contain secrets, are left out.
 *
 *   DISCORD_WEBHOOK_URL  webhook for #changelog (repo secret)
 *   WEEKLY               "true" posts the rolling week (the scheduled job)
 *   RELEASE_TAG          optional single version, for a manual one-off
 *   MENTION_HERE         "true" only when someone asks to ping
 *   DRY_RUN              "true" prints the message and does not post
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NOTES_URL = "https://iptvwebplayer.org/changelog";
const MAX_BULLETS = 4;
const MAX_WEEKLY_LINES = 8;
const MAX_LINE = 180;
/**
 * Versions dated on or before this day were already posted one at a time.
 * The weekly note starts with the next day so Friday does not repeat them.
 */
const ALREADY_POSTED_THROUGH = "2026-09-29";
/** Streamly purple (--brand). Discord wants a decimal color. */
const EMBED_COLOR = 0x7c5cff;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dev noise a user cannot see. "Series resume works again" stays.
 * "Updated Next.js" does not.
 */
function isInternal(line) {
  return (
    /\b(next\.js|eslint|webpack|vitest|github actions?|dependencies|dependency|refactor(?:ing|ed)?|chore\b|ci green)\b/i.test(
      line
    ) || /^updated (next|react|node|deps|dependencies)\b/i.test(line)
  );
}

function cleanMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text) {
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

function clip(text) {
  if (text.length <= MAX_LINE) return text;
  return `${text.slice(0, MAX_LINE - 1).trimEnd()}…`;
}

/** Drop a line rather than post an address, login, or key. */
function isSecret(text) {
  return (
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text) ||
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text) ||
    /:\/\/[^\s/]*:[^\s/]*@/.test(text) ||
    /\b(password|passwd|secret|api[_ -]?key|webhook|token|credential|private key)\b/i.test(
      text
    ) ||
    /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,}\b/.test(text) ||
    /\/opt\/|\/Users\/|ubuntu@|\.env\b/.test(text)
  );
}

function sentenceCase(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const cased = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(cased) ? cased : `${cased}.`;
}

/** How the app was built, not what a viewer gained. Drop the line. */
function isImplementation(text) {
  return (
    /\b(ac-?3|e-?ac-?3|eac3|aac|dts|hevc|h\.?26[45]|ffmpeg|m3u8|hls\.js|transcod\w*|re-?encod\w*|playhead|vps|sentry|webhook|5xx|50[0-9]|40[0-9]|encode slot|segments?|stub)\b/i.test(
      text
    ) ||
    /\b(api health|raw counters?|support message|stream address|account details)\b/i.test(
      text
    )
  );
}

/**
 * A short line a viewer can read. Implementation detail and secrets are
 * omitted instead of being edited into broken sentences.
 */
export function toPublicCopy(text, opts = {}) {
  if (!text || isSecret(text) || isImplementation(text)) return "";
  const line = cleanMarkdown(text);
  if (!line || isSecret(line) || isInternal(line) || isImplementation(line)) return "";
  if (/src\/|\.tsx?\b|\/api\/|console\.|\bfunction\s/.test(line)) return "";

  const body = opts.full ? line : firstSentence(line);
  if (body.length < 12) return "";
  return clip(sentenceCase(body));
}

/** @returns {{ label: string, detail: string }} */
export function shortenBullet(raw) {
  const text = cleanMarkdown(raw);
  const dash = text.match(/^(.+?)\s+[—–-]\s+([\s\S]+)$/);
  if (dash) {
    return { label: dash[1].trim(), detail: clip(firstSentence(dash[2].trim())) };
  }
  return { label: "", detail: clip(firstSentence(text)) };
}

function bulletPlain(bullet) {
  return bullet.label ? `${bullet.label} ${bullet.detail}` : bullet.detail;
}

export function parseChangelogEntry(markdown, version) {
  const ver = String(version).trim().replace(/^v/i, "");
  if (!ver) return null;
  const lines = markdown.split(/\r?\n/);
  const header = lines.findIndex((line) => line.startsWith(`## [${ver}]`));
  if (header < 0) return null;
  const date = lines[header].match(/(\d{4}-\d{2}-\d{2})\s*$/)?.[1] ?? "";

  const summary = [];
  const bullets = [];
  let inSummary = true;
  for (let i = header + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## [")) break;
    if (line.startsWith("### ")) {
      inSummary = false;
      continue;
    }
    if (line.startsWith("- ")) {
      inSummary = false;
      bullets.push(line.slice(2).trim());
      continue;
    }
    if (inSummary && line.trim() && line.trim() !== "---") {
      summary.push(line.trim());
    }
  }

  return {
    version: ver,
    date,
    summary: cleanMarkdown(summary.join(" ")),
    bullets,
  };
}

/** Every dated release, newest first, skipping Unreleased. */
export function parseChangelogEntries(markdown) {
  const versions = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^## \[([^\]]+)\]/);
    if (!match || match[1] === "Unreleased") continue;
    versions.push(match[1]);
  }
  return versions
    .map((version) => parseChangelogEntry(markdown, version))
    .filter((entry) => entry != null);
}

/**
 * Inclusive end, exclusive start. A Friday note covers the seven days after
 * the previous Friday, so that day's note is not posted again.
 */
export function weeklyWindow(now = new Date()) {
  const untilDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const sinceDate = new Date(untilDate);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - 7);
  return {
    since: sinceDate.toISOString().slice(0, 10),
    until: untilDate.toISOString().slice(0, 10),
  };
}

export function changelogEntriesInDigest(entries, since, until) {
  const floor =
    ALREADY_POSTED_THROUGH > since ? ALREADY_POSTED_THROUGH : since;
  return entries.filter(
    (entry) => entry.date && entry.date > floor && entry.date <= until
  );
}

function publicLinesForEntry(entry, seen, limit) {
  const lines = [];
  const summary =
    entry.summary && !isInternal(entry.summary)
      ? toPublicCopy(entry.summary, { full: true })
      : "";
  if (summary && !seen.has(summary.toLowerCase())) {
    seen.add(summary.toLowerCase());
    lines.push(summary);
  }
  for (const raw of entry.bullets) {
    if (lines.length >= limit) break;
    if (isSecret(raw) || isInternal(raw) || isImplementation(raw)) continue;
    const shortened = shortenBullet(raw);
    const source = shortened.detail || shortened.label;
    if (!source || isInternal(bulletPlain(shortened))) continue;
    const line = toPublicCopy(source);
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    lines.push(line);
  }
  return lines;
}

/**
 * Version title links to the changelog. @here stays outside the embed so a test
 * can post the same card without pinging the channel.
 *
 * @returns {{ skip: true, reason: string } | { skip: false, content: string, payload: { content?: string, allowed_mentions: { parse: string[] }, embeds: object[] } }}
 */
export function buildChangelogAnnouncement({
  markdown,
  version,
  mentionHere,
  notesUrl = NOTES_URL,
}) {
  const entry = parseChangelogEntry(markdown, version);
  if (!entry) {
    return {
      skip: true,
      reason: `CHANGELOG.md has no section for ${version}. Add the release notes, then publish.`,
    };
  }

  const summary =
    entry.summary && !isInternal(entry.summary)
      ? toPublicCopy(entry.summary, { full: true })
      : "";
  const seen = new Set();
  if (summary) seen.add(summary.toLowerCase());
  const bullets = [];
  for (const raw of entry.bullets) {
    if (isSecret(raw) || isInternal(raw) || isImplementation(raw)) continue;
    const shortened = shortenBullet(raw);
    const source = shortened.detail || shortened.label;
    if (!source || isInternal(bulletPlain(shortened))) continue;
    const line = toPublicCopy(source);
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    bullets.push(line);
    if (bullets.length >= MAX_BULLETS) break;
  }

  if (!summary && bullets.length === 0) {
    return {
      skip: true,
      reason: `v${entry.version} has no user-visible notes. Skipping Discord.`,
    };
  }

  const versionLabel = `v${entry.version}`;
  const parts = [];
  if (summary) parts.push(summary);
  if (bullets.length > 0) parts.push(bullets.map((line) => `- ${line}`).join("\n"));
  const description = parts.join("\n\n");

  /** @type {{ title: string, url: string, description: string, color: number, timestamp?: string }} */
  const embed = {
    title: `Streamly ${entry.version}`,
    url: `${notesUrl}#${versionLabel}`,
    description,
    color: EMBED_COLOR,
  };
  if (entry.date) embed.timestamp = `${entry.date}T12:00:00.000Z`;

  return {
    skip: false,
    content: description,
    payload: {
      ...(mentionHere ? { content: "@here" } : {}),
      allowed_mentions: { parse: mentionHere ? ["everyone"] : [] },
      embeds: [embed],
    },
  };
}

/** One card for every viewer-facing change dated inside the week. */
export function buildWeeklyAnnouncement({
  markdown,
  since,
  until,
  mentionHere,
  notesUrl = NOTES_URL,
}) {
  const entries = changelogEntriesInDigest(
    parseChangelogEntries(markdown),
    since,
    until
  );
  const seen = new Set();
  const lines = [];
  for (const entry of entries) {
    if (lines.length >= MAX_WEEKLY_LINES) break;
    lines.push(
      ...publicLinesForEntry(entry, seen, MAX_WEEKLY_LINES - lines.length)
    );
  }

  if (lines.length === 0) {
    return {
      skip: true,
      reason: `No viewer-facing updates between ${since} and ${until}. Skipping Discord.`,
    };
  }

  const description = lines.map((line) => `- ${line}`).join("\n");
  const embed = {
    title: "This week on Streamly",
    url: notesUrl,
    description,
    color: EMBED_COLOR,
    timestamp: `${until}T16:00:00.000Z`,
  };

  return {
    skip: false,
    content: description,
    payload: {
      ...(mentionHere ? { content: "@here" } : {}),
      allowed_mentions: { parse: mentionHere ? ["everyone"] : [] },
      embeds: [embed],
    },
  };
}

function readChangelog() {
  return readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf8");
}

async function main() {
  const mentionHere = process.env.MENTION_HERE === "true";
  const weekly = process.env.WEEKLY === "true" || !process.env.RELEASE_TAG?.trim();
  const markdown = readChangelog();
  const announcement = weekly
    ? buildWeeklyAnnouncement({
        markdown,
        ...weeklyWindow(new Date()),
        mentionHere,
      })
    : buildChangelogAnnouncement({
        markdown,
        version: process.env.RELEASE_TAG.trim(),
        mentionHere,
      });

  if (announcement.skip) {
    console.log(announcement.reason);
    process.exit(announcement.reason.startsWith("CHANGELOG.md has no section") ? 1 : 0);
  }

  console.log("--- Discord #changelog ---");
  console.log(announcement.content);
  console.log("---");

  if (process.env.DRY_RUN === "true") {
    console.log("DRY_RUN: not posted.");
    return;
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!webhook) {
    console.error(
      "DISCORD_WEBHOOK_URL is missing. Add the #changelog webhook as the repo secret DISCORD_CHANGELOG_WEBHOOK."
    );
    process.exit(1);
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(announcement.payload),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Discord webhook failed (${response.status}).`);
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  console.log(mentionHere ? "Posted to Discord with @here." : "Posted to Discord (no mention).");
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
