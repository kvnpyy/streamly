import { BrandMark } from "@/components/BrandMark";
import { CommunityGitHubFeedbackLink } from "@/components/CommunityGitHubFeedbackLink";
import { SITE_NAME } from "@/lib/site-brand";
import Link from "next/link";
import type { ReactNode } from "react";

export function BlogShell({
  children,
  backHref = "/",
  backLabel,
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="min-h-screen bg-[#06070b] text-[#eef0f6]">
      <header className="border-b border-white/8">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <Link href={backHref} className="flex items-center gap-2.5 shrink-0">
            <BrandMark className="size-8" />
            <span className="font-semibold text-sm">{SITE_NAME}</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-(--text-muted)">
            <Link href="/blog" className="hover:text-(--text) transition-colors">
              Blog
            </Link>
            <Link href="/changelog" className="hover:text-(--text) transition-colors">
              Changelog
            </Link>
            <CommunityGitHubFeedbackLink
              label="Feedback"
              className="hover:text-(--text) transition-colors text-(--text-muted)"
            />
            <Link href="/" className="hover:text-(--text) transition-colors">
              Home
            </Link>
            <Link
              href="/login"
              className="hover:text-(--text) transition-colors"
            >
              Open player
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10 sm:py-14">{children}</main>
      <footer className="max-w-3xl mx-auto px-4 pb-12 text-xs text-(--text-muted) border-t border-white/8 pt-8 mt-4">
        <Link
          href={backHref}
          className="hover:text-(--text) underline underline-offset-2"
        >
          ← {backLabel ?? `Back to ${SITE_NAME}`}
        </Link>
      </footer>
    </div>
  );
}

export function BlogProTip({ children }: { children: ReactNode }) {
  return (
    <aside className="my-8 rounded-xl border border-(--brand)/35 bg-(--brand)/10 px-5 py-4 text-sm leading-relaxed text-(--text-dim)">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-2">
        Pro tip
      </p>
      {children}
    </aside>
  );
}

export function BlogArticleBody({ children }: { children: ReactNode }) {
  return (
    <article className="blog-article space-y-6 text-[15px] sm:text-base leading-relaxed text-(--text-dim) [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:sm:text-2xl [&_h2]:font-semibold [&_h2]:text-(--text) [&_h2]:pt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-(--text) [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2 [&_a]:text-(--brand-2) [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-(--text) [&_code]:text-sm [&_code]:bg-white/6 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded">
      {children}
    </article>
  );
}
