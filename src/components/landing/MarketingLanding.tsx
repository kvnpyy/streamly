import { BrandMark } from "@/components/BrandMark";
import { CommunityDiscordLink } from "@/components/CommunityDiscordLink";
import { LandingHeroPreview } from "@/components/landing/LandingHeroPreview";
import { LandingSectionEyebrow } from "@/components/landing/LandingSectionEyebrow";
import { UserContentDisclaimer } from "@/components/UserContentDisclaimer";
import { getAllBlogPosts } from "@/lib/blog/registry";
import {
  LANDING_COMPARE_CARDS,
  LANDING_COMPARE_HEADING,
  LANDING_COMPARE_LEAD,
  LANDING_CTA_HEADING,
  LANDING_CTA_LEAD,
  LANDING_FAQ,
  LANDING_FAQ_HEADING,
  LANDING_FEATURES,
  LANDING_FEATURES_HEADING,
  LANDING_GUIDES_HEADING,
  LANDING_HERO_ASIDE,
  LANDING_HERO_KICKER,
  LANDING_HERO_LEAD,
  LANDING_STEPS,
  LANDING_STEPS_HEADING,
  type LandingFeatureIcon,
} from "@/lib/seo-landing";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Film,
  Grid3x3,
  Link2,
  Monitor,
  Shield,
  Smartphone,
  Tv,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

const FEATURE_ICONS: Record<LandingFeatureIcon, LucideIcon> = {
  tv: Tv,
  film: Film,
  link: Link2,
  devices: Smartphone,
  monitor: Monitor,
  shield: Shield,
};

const COMPARE_ICONS: Record<(typeof LANDING_COMPARE_CARDS)[number]["icon"], LucideIcon> = {
  user: User,
  grid: Grid3x3,
};

const HERO_TRUST = ["Xtream Codes", "M3U playlist", "Live EPG", "No install"];

const NAV_ANCHORS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
] as const;

export function MarketingLanding() {
  const posts = getAllBlogPosts().slice(0, 2);

  return (
    <div className="min-h-screen bg-[#06070b] text-[#eef0f6] selection:bg-[#7c5cff]/35">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-(--brand) focus:text-white focus:text-sm focus:font-medium landing-focus-ring"
      >
        Skip to content
      </a>

      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="absolute -top-48 right-0 size-[560px] rounded-full bg-[#7c5cff]/16 blur-[130px]" />
        <div className="absolute bottom-0 -left-40 size-[480px] rounded-full bg-[#00e0c6]/10 blur-[110px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#06070b]/80 backdrop-blur-xl supports-[backdrop-filter]:bg-[#06070b]/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0 group landing-focus-ring rounded-lg"
          >
            <BrandMark size={10} className="transition-transform group-hover:scale-[1.03]" />
            <div className="leading-tight">
              <span className="font-semibold text-sm block">{SITE_NAME}</span>
              <span className="text-[11px] text-(--text-muted) hidden sm:block">
                IPTV web player
              </span>
            </div>
          </Link>
          <nav
            className="flex items-center gap-1 sm:gap-2 text-sm"
            aria-label="Primary"
          >
            <div className="hidden md:flex items-center gap-1 mr-1">
              {NAV_ANCHORS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-(--text-muted) hover:text-(--text) transition-colors min-h-10 px-3 inline-flex items-center rounded-lg hover:bg-white/[0.04] landing-focus-ring"
                >
                  {item.label}
                </a>
              ))}
            </div>
            <Link
              href="/blog"
              className="text-(--text-muted) hover:text-(--text) transition-colors min-h-10 px-2.5 sm:px-3 inline-flex items-center rounded-lg hover:bg-white/[0.04] landing-focus-ring"
            >
              Blog
            </Link>
            <CommunityDiscordLink
              label="Discord"
              className="hidden sm:inline-flex text-(--text-muted) hover:text-(--text) transition-colors min-h-10 px-2.5 sm:px-3 rounded-lg hover:bg-white/[0.04] landing-focus-ring"
            />
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl btn-brand px-4 sm:px-5 py-2.5 text-sm font-semibold text-white min-h-10 shadow-[0_8px_28px_rgba(124,92,255,0.28)] landing-focus-ring"
            >
              Open player
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-14 sm:pb-20">
          <div className="grid lg:grid-cols-[1.08fr_0.92fr] gap-10 lg:gap-14 items-center">
            <div className="order-2 lg:order-1">
              <p className="inline-flex items-center gap-2 rounded-full border border-(--brand-2)/25 bg-(--brand-2)/8 px-3.5 py-1.5 text-xs sm:text-sm text-(--brand-2) font-medium mb-5 max-w-full">
                <span className="landing-live-dot size-1.5 rounded-full bg-(--brand-2) shrink-0" />
                <span>{LANDING_HERO_KICKER}</span>
              </p>
              <h1 className="text-[2rem] sm:text-4xl lg:text-[2.85rem] font-bold tracking-tight text-(--text) max-w-xl text-balance leading-[1.08]">
                IPTV web player{" "}
                <span className="block sm:inline bg-gradient-to-r from-[#eef0f6] via-[#c4b5fd] to-[#00e0c6] bg-clip-text text-transparent">
                  for your browser
                </span>
              </h1>
              <p className="mt-6 text-base sm:text-[1.0625rem] text-(--text-dim) max-w-xl leading-[1.7]">
                {LANDING_HERO_LEAD}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/login"
                  className="landing-focus-ring inline-flex items-center justify-center gap-2 rounded-xl btn-brand px-8 py-3.5 text-base font-semibold text-white min-h-12 shadow-[0_12px_40px_rgba(124,92,255,0.35)] hover:shadow-[0_16px_48px_rgba(124,92,255,0.42)] transition-shadow"
                >
                  Sign in with your provider
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
                <Link
                  href="/blog/how-to-self-host-streamly"
                  className="landing-focus-ring inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] px-6 py-3.5 text-sm font-medium text-(--text) min-h-12 hover:border-white/22 hover:bg-white/[0.06] transition-colors"
                >
                  Self-hosted IPTV player (Docker)
                </Link>
              </div>
              <ul className="mt-6 flex flex-wrap gap-2" aria-label="Supported formats">
                {HERO_TRUST.map((label) => (
                  <li key={label} className="chip text-[11px] sm:text-xs">
                    {label}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm text-(--text-muted) max-w-lg leading-relaxed flex gap-2">
                <Shield className="size-4 shrink-0 mt-0.5" aria-hidden />
                <span>{LANDING_HERO_ASIDE}</span>
              </p>
            </div>
            <div className="order-1 lg:order-2">
              <LandingHeroPreview />
            </div>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20"
          aria-labelledby="features-heading"
        >
          <LandingSectionEyebrow>Features</LandingSectionEyebrow>
          <h2
            id="features-heading"
            className="text-xl sm:text-2xl lg:text-[1.75rem] font-semibold text-(--text) mb-3 text-balance"
          >
            {LANDING_FEATURES_HEADING}
          </h2>
          <p className="text-(--text-dim) text-sm sm:text-base mb-8 max-w-2xl leading-relaxed">
            I hate cluttered players. This is what Streamly actually does. Not a marketing
            slide with thirty bullet points.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_FEATURES.map((f) => {
              const Icon = FEATURE_ICONS[f.icon];
              const isWide = Boolean(f.wide);
              return (
                <li
                  key={f.title}
                  className={cn(
                    "group landing-card-lift flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-white/18 hover:bg-white/[0.05]",
                    isWide && "sm:col-span-2 lg:col-span-2 lg:p-6 lg:flex-row lg:items-start lg:gap-5"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--brand)/15 text-(--brand-2) group-hover:bg-(--brand)/22 transition-colors",
                      isWide && "lg:size-12"
                    )}
                  >
                    <Icon className={cn("size-5", isWide && "lg:size-6")} aria-hidden />
                  </span>
                  <div className={cn(isWide && "lg:flex-1")}>
                    <h3 className="font-semibold text-(--text) mb-1.5 text-[15px] sm:text-base">
                      {f.title}
                    </h3>
                    <p className="text-sm text-(--text-dim) leading-relaxed">{f.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Steps */}
        <section
          id="how"
          className="scroll-mt-24 border-y border-white/8 bg-white/[0.02]"
          aria-labelledby="how-heading"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
            <LandingSectionEyebrow>Setup</LandingSectionEyebrow>
            <h2
              id="how-heading"
              className="text-xl sm:text-2xl lg:text-[1.75rem] font-semibold text-(--text) mb-10"
            >
              {LANDING_STEPS_HEADING}
            </h2>
            <ol className="relative grid gap-10 sm:grid-cols-3 sm:gap-8">
              <div
                className="hidden sm:block absolute top-[1.125rem] left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
                aria-hidden
              />
              {LANDING_STEPS.map((s) => (
                <li key={s.step} className="relative">
                  <span className="relative z-[1] inline-flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-(--brand) to-[#5230f0] text-sm font-bold text-white shadow-[0_4px_20px_rgba(124,92,255,0.4)] ring-4 ring-[#06070b]">
                    {s.step}
                  </span>
                  <h3 className="font-semibold text-(--text) mt-4 mb-2">{s.title}</h3>
                  <p className="text-sm text-(--text-dim) leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Compare */}
        <section
          className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16"
          aria-labelledby="compare-heading"
        >
          <LandingSectionEyebrow>Who it&apos;s for</LandingSectionEyebrow>
          <h2
            id="compare-heading"
            className="text-xl sm:text-2xl lg:text-[1.75rem] font-semibold text-(--text) mb-4 text-balance"
          >
            {LANDING_COMPARE_HEADING}
          </h2>
          <p className="text-(--text-dim) max-w-3xl leading-relaxed mb-8 text-[15px] sm:text-base">
            {LANDING_COMPARE_LEAD}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {LANDING_COMPARE_CARDS.map((card) => {
              const Icon = COMPARE_ICONS[card.icon];
              return (
                <div
                  key={card.title}
                  className="landing-card-lift rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-6 hover:border-white/16"
                >
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-(--brand-2)/10 text-(--brand-2) mb-4">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="font-semibold text-(--text) mb-2">{card.title}</h3>
                  <p className="text-sm text-(--text-dim) leading-relaxed">{card.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Guides */}
        {posts.length > 0 && (
          <section
            className="max-w-6xl mx-auto px-4 sm:px-6 pb-14"
            aria-labelledby="guides-heading"
          >
            <LandingSectionEyebrow>Blog</LandingSectionEyebrow>
            <h2
              id="guides-heading"
              className="text-xl sm:text-2xl font-semibold text-(--text) mb-6"
            >
              {LANDING_GUIDES_HEADING}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {posts.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="landing-focus-ring landing-card-lift group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 hover:border-(--brand)/30 hover:bg-white/[0.05]"
                  >
                    <time
                      dateTime={post.publishedAt}
                      className="text-[11px] text-(--text-muted) uppercase tracking-wide"
                    >
                      {new Date(post.publishedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {" · "}
                      {post.readingMinutes} min read
                    </time>
                    <h3 className="mt-2 font-semibold text-(--text) group-hover:text-(--brand-2) transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="mt-2 text-sm text-(--text-dim) line-clamp-3 leading-relaxed flex-1">
                      {post.description}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm text-(--brand-2) font-medium">
                      Read
                      <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/blog"
              className="landing-focus-ring inline-flex items-center gap-1 mt-6 text-sm text-(--brand-2) hover:underline underline-offset-2 min-h-11 rounded-lg px-1"
            >
              All posts
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </section>
        )}

        {/* FAQ */}
        <section
          id="faq"
          className="scroll-mt-24 max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20"
          aria-labelledby="faq-heading"
        >
          <LandingSectionEyebrow>FAQ</LandingSectionEyebrow>
          <h2
            id="faq-heading"
            className="text-xl sm:text-2xl font-semibold text-(--text) mb-6"
          >
            {LANDING_FAQ_HEADING}
          </h2>
          <div className="space-y-2">
            {LANDING_FAQ.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] open:border-(--brand)/30 open:bg-white/[0.05] transition-colors"
              >
                <summary className="landing-focus-ring cursor-pointer list-none rounded-2xl px-5 py-4 font-medium text-(--text) flex items-center justify-between gap-4 min-h-[52px] [&::-webkit-details-marker]:hidden">
                  <span className="text-left text-[15px] sm:text-base pr-2">
                    {item.question}
                  </span>
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] group-open:bg-(--brand)/15 transition-colors">
                    <ChevronRight className="size-4 text-(--text-muted) transition-transform duration-200 group-open:rotate-90 group-open:text-(--brand-2)" />
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm sm:text-[15px] text-(--text-dim) leading-relaxed border-t border-white/6 pt-4">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/8" aria-labelledby="cta-heading">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-(--brand)/14 via-[#0b0d14] to-(--brand-2)/10 px-6 sm:px-10 py-10 sm:py-14 text-center">
              <div
                className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-64 rounded-full bg-(--brand)/20 blur-3xl"
                aria-hidden
              />
              <div className="relative">
                <BrandMark size={11} className="mx-auto mb-5" />
                <h2
                  id="cta-heading"
                  className="text-2xl sm:text-3xl font-bold text-(--text) text-balance"
                >
                  {LANDING_CTA_HEADING}
                </h2>
                <p className="mt-4 text-(--text-dim) max-w-lg mx-auto leading-relaxed text-[15px] sm:text-base">
                  {LANDING_CTA_LEAD}
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
                  <Link
                    href="/login"
                    className="landing-focus-ring inline-flex items-center justify-center gap-2 rounded-xl btn-brand px-10 py-3.5 text-base font-semibold text-white min-h-12 w-full sm:w-auto shadow-[0_12px_40px_rgba(124,92,255,0.35)]"
                  >
                    Open player
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                  <CommunityDiscordLink
                    label="Join Discord"
                    className="landing-focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-[#5865F2]/35 bg-[#5865F2]/10 px-6 py-3.5 text-sm font-medium text-[#c7ceff] min-h-12 w-full sm:w-auto hover:bg-[#5865F2]/18 hover:border-[#5865F2]/50"
                  />
                  <a
                    href="#features"
                    className="landing-focus-ring inline-flex items-center justify-center rounded-xl border border-white/12 px-6 py-3.5 text-sm font-medium text-(--text) min-h-12 w-full sm:w-auto hover:bg-white/[0.04]"
                  >
                    See features
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-center gap-3">
              <BrandMark size={10} />
              <div>
                <p className="font-semibold text-sm">{SITE_NAME}</p>
                <p className="text-xs text-(--text-muted) mt-0.5">{SITE_TAGLINE}</p>
              </div>
            </div>
            <nav
              className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-(--text-muted)"
              aria-label="Footer"
            >
              {NAV_ANCHORS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="min-h-10 inline-flex items-center hover:text-(--text) landing-focus-ring rounded px-0.5"
                >
                  {item.label}
                </a>
              ))}
              <Link
                href="/blog"
                className="min-h-10 inline-flex items-center hover:text-(--text) landing-focus-ring rounded"
              >
                Blog
              </Link>
              <Link
                href="/changelog"
                className="min-h-10 inline-flex items-center hover:text-(--text) landing-focus-ring rounded"
              >
                Changelog
              </Link>
              <CommunityDiscordLink
                label="Discord"
                className="min-h-10 hover:text-(--text) landing-focus-ring rounded px-0.5 text-(--text-muted)"
              />
              <Link
                href="/login"
                className="min-h-10 inline-flex items-center hover:text-(--text) landing-focus-ring rounded"
              >
                Sign in
              </Link>
            </nav>
          </div>
          <UserContentDisclaimer />
          <div className="flex flex-wrap justify-center sm:justify-start gap-x-6 gap-y-2 text-sm text-(--text-muted)">
            <Link
              href="/legal/terms"
              className="min-h-10 inline-flex items-center underline underline-offset-2 hover:text-(--text) landing-focus-ring"
            >
              Terms
            </Link>
            <Link
              href="/legal/privacy"
              className="min-h-10 inline-flex items-center underline underline-offset-2 hover:text-(--text) landing-focus-ring"
            >
              Privacy
            </Link>
            <Link
              href="/changelog"
              className="min-h-10 inline-flex items-center underline underline-offset-2 hover:text-(--text) landing-focus-ring"
            >
              Changelog
            </Link>
            <CommunityDiscordLink
              label="Discord"
              className="min-h-10 underline underline-offset-2 hover:text-(--text) landing-focus-ring text-(--text-muted)"
            />
          </div>
          <p className="text-center sm:text-left text-xs text-(--text-muted)">
            {SITE_NAME} · iptvwebplayer.org
          </p>
        </div>
      </footer>
    </div>
  );
}
