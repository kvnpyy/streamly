import type { ReactNode } from "react";

export function LandingSectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--brand-2) mb-3">
      {children}
    </p>
  );
}
