import { GITHUB_DISCUSSIONS_FEEDBACK_URL } from "@/lib/site-brand";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Visible label. Defaults to "Feedback & Ideas". */
  label?: string;
};

/** External link to the pinned GitHub Discussions feedback thread. */
export function CommunityGitHubFeedbackLink({
  className,
  label = "Feedback & Ideas",
}: Props) {
  return (
    <a
      href={GITHUB_DISCUSSIONS_FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <span>{label}</span>
    </a>
  );
}
