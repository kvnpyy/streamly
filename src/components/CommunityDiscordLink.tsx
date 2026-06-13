import { DiscordIcon } from "@/components/DiscordIcon";
import { discordInviteUrl } from "@/lib/site-brand";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Visible label. Defaults to "Community". */
  label?: string;
  showIcon?: boolean;
};

/** External link to the Streamly Discord — hidden when invite URL is unset. */
export function CommunityDiscordLink({
  className,
  label = "Community",
  showIcon = true,
}: Props) {
  const href = discordInviteUrl();
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {showIcon ? <DiscordIcon /> : null}
      <span>{label}</span>
    </a>
  );
}
