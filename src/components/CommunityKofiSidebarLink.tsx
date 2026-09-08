"use client";

import { KOFI_SUPPORT_URL, SITE_NAME } from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import { Coffee } from "lucide-react";

/** Sidebar / sheet row — tip the project on Ko-fi. */
export function CommunityKofiSidebarLink({
  collapsed = false,
  className,
  onNavigate,
}: {
  collapsed?: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={KOFI_SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onNavigate}
      title={collapsed ? "Support on Ko-fi" : undefined}
      aria-label={`Support ${SITE_NAME} on Ko-fi (opens in a new tab)`}
      className={cn(
        "flex w-full items-center rounded-xl text-sm transition-colors",
        collapsed
          ? "justify-center px-2 py-2.5 text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
          : "gap-3 px-3 py-2.5 text-[#ffb4a8] hover:text-[#ffcfc7] hover:bg-[#ff5e5b]/10",
        className
      )}
    >
      <Coffee className="size-[18px] shrink-0" />
      {!collapsed && "Support"}
    </a>
  );
}
