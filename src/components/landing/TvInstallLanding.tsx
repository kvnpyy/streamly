"use client";

import { BrandMark } from "@/components/BrandMark";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { UserContentDisclaimer } from "@/components/UserContentDisclaimer";
import {
  TV_INSTALL_HEADLINE,
  TV_INSTALL_LEAD,
  TV_INSTALL_PIN_STEPS,
  TV_PLATFORM_GUIDES,
  tvLoginUrl,
  type TvPlatformId,
} from "@/lib/tv-install-guide";
import { SITE_NAME } from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import { ChevronRight, Monitor, QrCode, Smartphone, Tv } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

function useClientLoginUrl(): string {
  return useSyncExternalStore(
    () => () => {},
    () => tvLoginUrl(window.location.origin),
    () => tvLoginUrl()
  );
}

function TvQrPanel({ loginUrl }: { loginUrl: string }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(loginUrl)}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="shrink-0 rounded-xl overflow-hidden bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt={`QR code to open ${SITE_NAME} sign in`}
            width={240}
            height={240}
            className="block"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="flex-1 text-center sm:text-left min-w-0">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-(--text-muted) mb-2">
            <QrCode className="size-3.5" aria-hidden />
            Scan on your phone
          </div>
          <p className="text-sm text-(--text-dim) leading-relaxed mb-3">
            Point your phone camera at the code to open the sign-in page. After you connect your
            provider, generate a TV PIN in Settings.
          </p>
          <div className="rounded-xl bg-(--bg-3) border border-(--line) px-4 py-3 font-mono text-sm text-(--text) break-all">
            {loginUrl}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformTabs({
  active,
  onChange,
}: {
  active: TvPlatformId;
  onChange: (id: TvPlatformId) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label="Smart TV platform"
    >
      {TV_PLATFORM_GUIDES.map((guide) => (
        <button
          key={guide.id}
          type="button"
          role="tab"
          aria-selected={active === guide.id}
          onClick={() => onChange(guide.id)}
          className={cn(
            "h-10 px-4 rounded-xl text-sm font-medium border transition-colors landing-focus-ring",
            active === guide.id
              ? "border-(--brand)/50 bg-(--brand)/15 text-(--text)"
              : "border-white/10 bg-white/[0.03] text-(--text-dim) hover:border-white/20 hover:text-(--text)"
          )}
        >
          {guide.label}
        </button>
      ))}
    </div>
  );
}

export function TvInstallLanding() {
  const onTv = useTvBrowser();
  const [platform, setPlatform] = useState<TvPlatformId>("samsung");
  const loginUrl = useClientLoginUrl();

  const guide = useMemo(
    () => TV_PLATFORM_GUIDES.find((g) => g.id === platform) ?? TV_PLATFORM_GUIDES[0]!,
    [platform]
  );

  return (
    <div className="min-h-screen bg-[#06070b] text-[#eef0f6]">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 right-0 size-[520px] rounded-full bg-[#7c5cff]/14 blur-[120px]" />
        <div className="absolute bottom-0 -left-32 size-[420px] rounded-full bg-[#00e0c6]/8 blur-[100px]" />
      </div>

      <header className="border-b border-white/8 bg-[#06070b]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 landing-focus-ring rounded-lg">
            <BrandMark size={10} />
            <span className="font-semibold text-sm">{SITE_NAME}</span>
          </Link>
          <Link
            href="/login"
            className="h-9 px-4 rounded-xl btn-brand text-sm font-medium inline-flex items-center gap-1.5 landing-focus-ring"
          >
            Sign in
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex items-center gap-3 text-(--brand-2) mb-4">
          <Tv className="size-6" aria-hidden />
          <span className="text-xs uppercase tracking-wider font-medium">Smart TV</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
          {TV_INSTALL_HEADLINE}
        </h1>
        <p className="text-(--text-dim) text-base sm:text-lg leading-relaxed max-w-2xl mb-8">
          {TV_INSTALL_LEAD}
        </p>

        {onTv ? (
          <section className="rounded-2xl border border-(--brand)/30 bg-(--brand)/8 p-6 sm:p-8 mb-10">
            <div className="flex gap-3 items-start mb-4">
              <Monitor className="size-5 text-(--brand-2) shrink-0 mt-0.5" aria-hidden />
              <div>
                <h2 className="text-lg font-semibold mb-1">You&apos;re on a TV browser</h2>
                <p className="text-sm text-(--text-dim) leading-relaxed">
                  Skip the QR code. Open {SITE_NAME} on your phone or laptop, go to Settings, and
                  generate a TV code. Then sign in here with PIN.
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="h-11 px-5 rounded-xl btn-brand text-sm font-medium inline-flex items-center gap-2 landing-focus-ring"
            >
              Sign in with PIN
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </section>
        ) : (
          <div className="mb-10">
            <TvQrPanel loginUrl={loginUrl} />
          </div>
        )}

        <section className="mb-12" aria-labelledby="pin-flow-heading">
          <div className="flex items-center gap-2 mb-4">
            <Smartphone className="size-5 text-(--brand-2)" aria-hidden />
            <h2 id="pin-flow-heading" className="text-xl font-semibold">
              Link with a PIN (recommended)
            </h2>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {TV_INSTALL_PIN_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="text-xs font-semibold text-(--brand-2) mb-2">Step {i + 1}</div>
                <h3 className="text-sm font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-(--text-dim) leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12" aria-labelledby="platform-heading">
          <h2 id="platform-heading" className="text-xl font-semibold mb-4">
            Platform setup
          </h2>
          <PlatformTabs active={platform} onChange={setPlatform} />
          <div
            role="tabpanel"
            className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
          >
            <p className="text-sm text-(--text-muted) mb-4">
              Browser: <strong className="text-(--text)">{guide.browser}</strong>
            </p>
            <ol className="space-y-4">
              {guide.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--brand)/15 text-(--brand-2) text-sm font-semibold">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold mb-1">{step.title}</h3>
                    <p className="text-sm text-(--text-dim) leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 mb-8">
          <h2 className="text-lg font-semibold mb-2">App store apps (coming soon)</h2>
          <p className="text-sm text-(--text-dim) leading-relaxed mb-3">
            Wrapper builds for Samsung, LG, and Fire TV are in{" "}
            <code className="text-(--text) bg-(--bg-3) px-1.5 py-0.5 rounded text-xs">
              tv-apps/
            </code>{" "}
            in the repo. They point at the same web app — useful when you want a store listing
            without maintaining a separate native player.
          </p>
          <p className="text-sm text-(--text-muted)">
            Self-hosting? Use your own URL everywhere instead of iptvwebplayer.org.
          </p>
        </section>

        <UserContentDisclaimer />

        <p className="mt-8 text-center text-sm text-(--text-muted)">
          <Link href="/" className="underline underline-offset-2 hover:text-(--text) landing-focus-ring">
            Back to home
          </Link>
          {" · "}
          <Link href="/login" className="underline underline-offset-2 hover:text-(--text) landing-focus-ring">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
