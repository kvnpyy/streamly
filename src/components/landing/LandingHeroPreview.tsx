import { BrandMark } from "@/components/BrandMark";
import { SITE_NAME } from "@/lib/site-brand";

const CHANNELS = [
  { name: "News 24", on: "Evening bulletin", accent: "from-violet-500/45 to-violet-900/25" },
  { name: "Sport HD", on: "Live, Q2", accent: "from-cyan-500/40 to-cyan-900/20" },
  { name: "Cinema", on: "Feature film", accent: "from-fuchsia-500/35 to-fuchsia-900/20" },
  { name: "Kids", on: "Cartoons", accent: "from-amber-500/35 to-amber-900/18" },
];

/** CSS-only faux UI — gives the hero something to look at without shipping screenshots. */
export function LandingHeroPreview() {
  return (
    <div
      className="landing-hero-preview relative w-full max-w-md mx-auto lg:mx-0 lg:max-w-none lg:justify-self-end"
      aria-hidden
    >
      <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-(--brand)/30 via-transparent to-(--brand-2)/20 blur-3xl opacity-70" />
      <div className="relative rounded-2xl border border-white/14 bg-[#0b0d14]/95 shadow-[0_28px_90px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden ring-1 ring-white/5">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/8 bg-white/[0.04]">
          <div className="flex gap-1.5 shrink-0">
            <span className="size-2.5 rounded-full bg-[#ff5f57]/90" />
            <span className="size-2.5 rounded-full bg-[#febc2e]/90" />
            <span className="size-2.5 rounded-full bg-[#28c840]/90" />
          </div>
          <BrandMark size={8} className="shrink-0" />
          <span className="ml-0.5 text-[11px] text-(--text-muted) font-medium truncate flex-1">
            {SITE_NAME}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-(--brand-2) shrink-0">
            <span className="landing-live-dot size-1.5 rounded-full bg-(--brand-2)" />
            Live
          </span>
        </div>
        <div className="p-4 sm:p-5 space-y-3.5">
          <div className="flex gap-2">
            {["Live", "Movies", "Series"].map((tab, i) => (
              <span
                key={tab}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
                  i === 0
                    ? "bg-(--brand)/30 text-(--text) ring-1 ring-(--brand)/40"
                    : "text-(--text-muted) bg-white/[0.04]"
                }`}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {CHANNELS.map((ch, i) => (
              <div
                key={ch.name}
                className={`rounded-xl border border-white/10 bg-gradient-to-br ${ch.accent} p-3 min-h-[76px] flex flex-col justify-end ${
                  i === 0 ? "ring-1 ring-(--brand)/35" : ""
                }`}
              >
                <span className="text-xs font-semibold text-(--text)">{ch.name}</span>
                <span className="text-[10px] text-(--text-dim) mt-0.5 truncate">{ch.on}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 flex items-center gap-3">
            <div className="size-9 rounded-lg bg-gradient-to-br from-(--brand) to-[#5230f0] shrink-0 grid place-items-center shadow-[0_4px_16px_rgba(124,92,255,0.35)]">
              <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-white ml-0.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-(--text) truncate">Evening bulletin</p>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-2">
                <div className="h-full w-[42%] rounded-full bg-gradient-to-r from-(--brand) to-(--brand-2)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
