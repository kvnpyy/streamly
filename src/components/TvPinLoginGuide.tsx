import { TV_INSTALL_PIN_STEPS } from "@/lib/tv-install-guide";
import { SITE_NAME } from "@/lib/site-brand";
import { Tv } from "lucide-react";
import Link from "next/link";

type TvPinLoginGuideProps = {
  /** Shorter copy for the in-app onboarding connect screen. */
  variant?: "login" | "onboarding";
};

export function TvPinLoginGuide({ variant = "login" }: TvPinLoginGuideProps) {
  return (
    <div className="rounded-xl border border-(--brand)/25 bg-(--brand)/8 px-4 py-4 space-y-3">
      <div className="flex items-start gap-3">
        <Tv className="size-5 text-(--brand-2) shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-(--text)">
            {variant === "onboarding"
              ? "Link this TV with a PIN"
              : "Sign in with a PIN from your phone"}
          </p>
          <p className="text-xs text-(--text-dim) mt-1 leading-relaxed">
            {variant === "onboarding"
              ? "Fastest way on a TV remote — no typing your server URL or password."
              : `On your phone or laptop, open ${SITE_NAME} → Settings → Link a TV with a PIN.`}
          </p>
        </div>
      </div>
      <ol className="space-y-2">
        {TV_INSTALL_PIN_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-2.5 text-xs text-(--text-dim)">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--brand)/15 text-(--brand-2) text-[10px] font-semibold">
              {i + 1}
            </span>
            <span className="leading-relaxed pt-0.5">
              <strong className="text-(--text) font-medium">{step.title}</strong>
              {" — "}
              {step.body}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-(--text-muted)">
        <Link href="/tv" className="text-(--brand-2) underline underline-offset-2 hover:text-(--text)">
          Full TV setup guide
        </Link>
        {" · "}Codes expire in 10 minutes.
      </p>
    </div>
  );
}
