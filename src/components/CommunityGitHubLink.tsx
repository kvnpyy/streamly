import { GitHubIcon } from "@/components/GitHubIcon";
import { GITHUB_REPO_URL, SITE_NAME } from "@/lib/site-brand";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Visible label. Defaults to "GitHub". */
  label?: string;
  showIcon?: boolean;
  onNavigate?: () => void;
};

/** External link to the public Streamly GitHub repo. */
export function CommunityGitHubLink({
  className,
  label = "GitHub",
  showIcon = true,
  onNavigate,
}: Props) {
  return (
    <a
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${SITE_NAME} on GitHub (opens in a new tab)`}
      onClick={onNavigate}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {showIcon ? <GitHubIcon /> : null}
      <span>{label}</span>
    </a>
  );
}
