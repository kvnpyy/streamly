"use client";

import { DiscordIcon } from "@/components/DiscordIcon";
import { discordInviteUrl } from "@/lib/site-brand";
import { cn } from "@/lib/utils";

/** Sidebar / sheet row — matches Feedback + Settings styling. */
export function CommunityDiscordSidebarLink({
  collapsed = false,
  className,
  onNavigate,
}: {
  collapsed?: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  const href = discordInviteUrl();
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onNavigate}
      title={collapsed ? "Join Discord" : undefined}
      aria-label="Join Streamly Discord (opens in a new tab)"
      className={cn(
        "flex w-full items-center rounded-xl text-sm transition-colors",
        collapsed
          ? "justify-center px-2 py-2.5 text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
          : "gap-3 px-3 py-2.5 text-[#b8c0ff] hover:text-[#dce0ff] hover:bg-[#5865F2]/10",
        className
      )}
    >
      <DiscordIcon className="size-[18px] shrink-0" />
      {!collapsed && "Join Discord"}
    </a>
  );
}
