import { ChangelogHashOpen } from "@/components/changelog/ChangelogHashOpen";
import { BlogShell } from "@/components/blog/BlogShell";
import {
  CHANGELOG,
  CHANGELOG_RECENT_VISIBLE,
  formatChangelogVersion,
  getLatestChangelogEntry,
  groupChangelogByMonth,
  type ChangelogEntry,
} from "@/lib/changelog";
import { absoluteSiteUrl, SITE_NAME } from "@/lib/site-brand";
import type { Metadata } from "next";
import Link from "next/link";

const latest = getLatestChangelogEntry();
const recent = CHANGELOG.slice(0, CHANGELOG_RECENT_VISIBLE);
const earlier = groupChangelogByMonth(CHANGELOG.slice(CHANGELOG_RECENT_VISIBLE));

export const metadata: Metadata = {
  title: `What's new in ${formatChangelogVersion(latest.version)}`,
  description: `Release notes for ${SITE_NAME} — IPTV web player updates, fixes, and new features.`,
  alternates: { canonical: "/changelog" },
  openGraph: {
    title: `${SITE_NAME} changelog`,
    description: `What's new in ${formatChangelogVersion(latest.version)} and earlier releases.`,
    url: absoluteSiteUrl("/changelog"),
  },
};

function ChangelogRelease({
  entry,
  latest: isLatest,
}: {
  entry: ChangelogEntry;
  latest?: boolean;
}) {
  return (
    <article
      id={`v${entry.version}`}
      className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-7"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-semibold text-(--text)">
          <a href={`#v${entry.version}`} className="hover:text-(--brand-2)">
            {formatChangelogVersion(entry.version)}
          </a>
        </h2>
        {isLatest ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-(--brand-2) bg-(--brand)/15 border border-(--brand)/30 px-2 py-0.5 rounded-full">
            Latest
          </span>
        ) : null}
        <time dateTime={entry.date} className="text-sm text-(--text-muted)">
          {new Date(`${entry.date}T00:00:00Z`).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
        </time>
      </div>
      <p className="mt-2 text-sm text-(--text-dim)">{entry.summary}</p>
      <ul className="mt-4 space-y-2 text-sm text-(--text-dim) leading-relaxed list-disc pl-5">
        {entry.highlights.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

export default function ChangelogPage() {
  return (
    <BlogShell backHref="/" backLabel="Home">
      <ChangelogHashOpen />
      <div className="space-y-10">
        <header className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2)">
            Changelog
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-(--text)">
            What&apos;s new in {formatChangelogVersion(latest.version)}
          </h1>
          <p className="text-(--text-muted) max-w-xl leading-relaxed">
            {`${latest.summary} The project ships often — here's what changed recently. Self-hosters: match your build label (bottom-right in the app) to a version below.`}
          </p>
          <p className="text-sm text-(--text-dim)">
            Also on{" "}
            <a
              href="https://github.com/kvnpyy/streamly/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--brand-2) underline underline-offset-2"
            >
              GitHub CHANGELOG.md
            </a>
            . Ideas and feedback welcome in{" "}
            <a
              href="https://github.com/kvnpyy/streamly/discussions/7"
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--brand-2) underline underline-offset-2"
            >
              GitHub Discussions
            </a>
            .
          </p>
        </header>

        <div className="space-y-8">
          {recent.map((entry, index) => (
            <ChangelogRelease
              key={entry.version}
              entry={entry}
              latest={index === 0}
            />
          ))}
        </div>

        {earlier.length > 0 ? (
          <section className="space-y-3" aria-labelledby="earlier-releases">
            <h2
              id="earlier-releases"
              className="text-sm font-semibold uppercase tracking-widest text-(--text-muted)"
            >
              Earlier releases
            </h2>
            {earlier.map((group) => (
              <details
                key={group.key}
                id={`month-${group.key}`}
                className="group rounded-2xl border border-white/10 bg-white/[0.02] open:bg-transparent"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-(--text) [&::-webkit-details-marker]:hidden">
                  <span className="font-semibold">{group.label}</span>
                  <span className="flex items-center gap-2 text-sm text-(--text-muted)">
                    {group.entries.length}{" "}
                    {group.entries.length === 1 ? "release" : "releases"}
                    <span
                      aria-hidden
                      className="inline-block size-2 rotate-45 border-b-2 border-r-2 border-white/50 transition-transform group-open:rotate-[225deg] group-open:translate-y-0.5"
                    />
                  </span>
                </summary>
                <div className="space-y-4 px-3 pb-4 sm:px-4">
                  {group.entries.map((entry) => (
                    <ChangelogRelease key={entry.version} entry={entry} />
                  ))}
                </div>
              </details>
            ))}
          </section>
        ) : null}

        <p className="text-sm text-(--text-muted) border-t border-white/10 pt-8">
          Guides and deeper write-ups live on the{" "}
          <Link
            href="/blog"
            className="text-(--brand-2) underline underline-offset-2"
          >
            blog
          </Link>
          .
        </p>
      </div>
    </BlogShell>
  );
}
