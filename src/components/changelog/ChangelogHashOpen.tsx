"use client";

import { useEffect } from "react";

/** Open the month group that contains a #v0.13.x link, then scroll to that release. */
export function ChangelogHashOpen() {
  useEffect(() => {
    const openTarget = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      const details = el.closest("details");
      if (details) details.open = true;
      el.scrollIntoView({ block: "start" });
    };
    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, []);
  return null;
}
