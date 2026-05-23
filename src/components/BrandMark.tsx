import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Outer box size (tailwind size class number, e.g. 9 → 2.25rem). */
  size?: 8 | 9 | 10 | 11;
};

/**
 * Lightweight wordless mark — gradient tile + play motif (no external assets).
 */
export function BrandMark({ className, size = 9 }: Props) {
  const box = size === 8 ? "size-8" : size === 10 ? "size-10" : size === 11 ? "size-11" : "size-9";
  const play = size === 8 ? "size-2.5" : size === 10 ? "size-3.5" : size === 11 ? "size-4" : "size-3";
  return (
    <div
      className={cn(
        box,
        "rounded-xl bg-gradient-to-br from-(--brand) to-(--brand-2) shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_28px_rgba(124,92,255,0.35)] grid place-items-center shrink-0",
        className
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className={cn(play, "text-white drop-shadow-sm")}
        fill="currentColor"
      >
        <path d="M9 6.5v11l9-5.5L9 6.5z" opacity="0.95" />
        <path
          d="M5 18V6l1.2 6.5L5 18z"
          fill="white"
          fillOpacity="0.35"
        />
      </svg>
    </div>
  );
}
