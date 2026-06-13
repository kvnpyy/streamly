import { BlogShell } from "@/components/blog/BlogShell";
import {
  CHANGELOG,
  formatChangelogVersion,
  getLatestChangelogEntry,
} from "@/lib/changelog";
import { absoluteSiteUrl, SITE_NAME } from "@/lib/site-brand";
import type { Metadata } from "next";
import Link from "next/link";

const latest = getLatestChangelogEntry();

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

export default function ChangelogPage() {
  return (
    <BlogShell backHref="/" backLabel="Home">
      <div className="space-y-10">
        <header className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2)">
            Changelog
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-(--text)">
            What&apos;s new in {formatChangelogVersion(latest.version)}
          </h1>
          <p className="text-(--text-muted) max-w-xl leading-relaxed">
            {latest.summary} The project ships often — here&apos;s what changed
            recently. Self-hosters: match your build label (bottom-right in the
            app) to a version below.
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
            .
          </p>
        </header>

        <div className="space-y-8">
          {CHANGELOG.map((entry, index) => (
            <article
              key={entry.version}
              id={`v${entry.version}`}
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-7"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-semibold text-(--text)">
                  {formatChangelogVersion(entry.version)}
                </h2>
                {index === 0 ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-(--brand-2) bg-(--brand)/15 border border-(--brand)/30 px-2 py-0.5 rounded-full">
                    Latest
                  </span>
                ) : null}
                <time
                  dateTime={entry.date}
                  className="text-sm text-(--text-muted)"
                >
                  {new Date(entry.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
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
          ))}
        </div>

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
