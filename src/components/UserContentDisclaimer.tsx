import { USER_CONTENT_DISCLAIMER_SHORT } from "@/lib/site-brand";
import { cn } from "@/lib/utils";

export function UserContentDisclaimer({
  className,
  id,
}: {
  className?: string;
  /** Pass when linking with `aria-describedby`. */
  id?: string;
}) {
  return (
    <p
      id={id}
      role="note"
      className={cn(
        "text-[11px] sm:text-xs text-(--text-muted) leading-relaxed text-pretty border border-(--line)/80 rounded-xl bg-(--bg-2)/60 px-3 py-2.5",
        className
      )}
    >
      {USER_CONTENT_DISCLAIMER_SHORT}
    </p>
  );
}
